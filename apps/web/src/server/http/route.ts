import "server-only";

import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { applyIngressFloodLimit } from "../services/ingressLimits";
import { createRequestContext } from "./context";
import { jsonError, jsonSuccess } from "./envelopes";
import { EdgeError } from "./errors";

export async function handleRoute(
  request: NextRequest,
  input: {
    resource: string;
    status?: number;
    handler: (
      ctx: Awaited<ReturnType<typeof createRequestContext>>,
      request: NextRequest,
    ) => Promise<unknown>;
  },
) {
  const ctx = await createRequestContext(request);

  try {
    const limited = await applyIngressFloodLimit({
      ip: ctx.ip,
      now: ctx.now,
    });
    if (limited) {
      throw new EdgeError({
        kind: "rate_limited",
        message: "Request rate limit exceeded",
        details: {
          scope: limited.scope,
          limit: limited.limit,
          windowSeconds: limited.windowSeconds,
          resetAt: new Date(limited.resetAtMs).toISOString(),
        },
        status: 429,
      });
    }

    const payload = await input.handler(ctx, request);
    return jsonSuccess({
      traceId: ctx.traceId,
      resource: input.resource,
      payload,
      now: ctx.now,
      status: input.status,
    });
  } catch (error) {
    if (error instanceof EdgeError) {
      return jsonError({
        traceId: ctx.traceId,
        kind: error.kind,
        message: error.message,
        details: error.details,
        now: ctx.now,
        status: error.status,
      });
    }

    return jsonError({
      traceId: ctx.traceId,
      kind: "internal_error",
      message: "Internal server error",
      details: { errorId: randomUUID() },
      now: ctx.now,
      status: 500,
    });
  }
}
