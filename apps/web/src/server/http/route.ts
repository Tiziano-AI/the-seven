import "server-only";

import { randomUUID } from "node:crypto";
import { serverRuntime } from "@the-seven/config";
import {
  forbiddenDetails,
  internalErrorDetails,
  invalidInputDetails,
  type RouteBody,
  type RouteContract,
  type RouteParams,
  type RouteQuery,
  rateLimitedDetails,
} from "@the-seven/contracts";
import type { NextRequest, NextResponse } from "next/server";
import { redactRateLimitScope } from "../domain/redaction";
import { admitIngressFloodLimit } from "../services/ingressLimits";
import type { AuthContext } from "./auth";
import { resolveAuthContext } from "./auth";
import { createRequestMetadataContext, type RequestContext } from "./context";
import { jsonError, jsonSuccess } from "./envelopes";
import { EdgeError, mapProviderErrorToEdgeError } from "./errors";
import { parseJsonBody, parseNoBody } from "./parse";

type RawRouteParams = Promise<Readonly<Record<string, string>>> | Readonly<Record<string, string>>;

export type ParsedRouteInput<Contract extends RouteContract> = Readonly<{
  params: RouteParams<Contract>;
  query: RouteQuery<Contract>;
  body: RouteBody<Contract>;
}>;

function unauthenticatedContext(): AuthContext {
  return { kind: "none" };
}

function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const configuredOrigin = serverRuntime().publicOrigin.replace(/\/+$/, "");
  const requestOrigin = request.nextUrl.origin;
  const allowed = new Set([configuredOrigin, requestOrigin]);
  if (origin && allowed.has(origin.replace(/\/+$/, ""))) {
    return;
  }
  if (referer) {
    const refererOrigin = parseUrlOrigin(referer);
    if (refererOrigin && allowed.has(refererOrigin)) {
      return;
    }
  }

  throw new EdgeError({
    kind: "forbidden",
    message: "Same-origin request required for cookie authentication",
    details: forbiddenDetails("same_origin_required"),
    status: 403,
  });
}

function parseUrlOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

async function admitRequest(request: NextRequest, route: RouteContract): Promise<RequestContext> {
  const metadata = createRequestMetadataContext(request);
  const limited = await admitIngressFloodLimit({
    ip: metadata.ip,
    now: metadata.now,
  });
  if (limited) {
    throw new EdgeError({
      kind: "rate_limited",
      message: "Request rate limit exceeded",
      details: rateLimitedDetails({
        scope: redactRateLimitScope(limited.scope),
        limit: limited.limit,
        windowSeconds: limited.windowSeconds,
        resetAt: new Date(limited.resetAtMs).toISOString(),
      }),
      status: 429,
    });
  }

  const ctx = {
    ...metadata,
    auth:
      route.auth === "public"
        ? unauthenticatedContext()
        : await resolveAuthContext(request, metadata.now),
  };

  if (ctx.auth.kind === "demo" && request.method !== "GET") {
    assertSameOrigin(request);
  }

  return ctx;
}

function buildQueryRecord(searchParams: URLSearchParams) {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams.entries()) {
    const existing = query[key];
    if (typeof existing === "string") {
      query[key] = [existing, value];
    } else if (Array.isArray(existing)) {
      query[key] = [...existing, value];
    } else {
      query[key] = value;
    }
  }
  return query;
}

async function parseRouteBody<Contract extends RouteContract>(
  request: NextRequest,
  route: Contract,
): Promise<RouteBody<Contract>> {
  const emptyBody = route.bodySchema.safeParse({});
  if (emptyBody.success) {
    await parseNoBody(request);
    return emptyBody.data;
  }
  return parseJsonBody(request, route.bodySchema);
}

async function parseRouteInput<Contract extends RouteContract>(
  request: NextRequest,
  route: Contract,
  rawParams?: RawRouteParams,
): Promise<ParsedRouteInput<Contract>> {
  const paramsResult = route.paramsSchema.safeParse(rawParams ? await rawParams : {});
  if (!paramsResult.success) {
    throw new EdgeError({
      kind: "invalid_input",
      message: "Invalid path parameters",
      details: invalidInputDetails(
        paramsResult.error.issues.map((issue) => ({
          path: `params.${issue.path.join(".")}`,
          message: issue.message,
        })),
      ),
      status: 400,
    });
  }

  const queryResult = route.querySchema.safeParse(buildQueryRecord(request.nextUrl.searchParams));
  if (!queryResult.success) {
    throw new EdgeError({
      kind: "invalid_input",
      message: "Invalid query parameters",
      details: invalidInputDetails(
        queryResult.error.issues.map((issue) => ({
          path: `query.${issue.path.join(".")}`,
          message: issue.message,
        })),
      ),
      status: 400,
    });
  }

  const body = await parseRouteBody(request, route);
  return {
    params: paramsResult.data,
    query: queryResult.data,
    body,
  };
}

function mapErrorToResponse(input: { error: unknown; traceId: string; now: Date }) {
  if (input.error instanceof EdgeError) {
    return jsonError({
      traceId: input.traceId,
      kind: input.error.kind,
      message: input.error.message,
      details: input.error.details,
      now: input.now,
      status: input.error.status,
    });
  }

  const mappedProviderError = mapProviderErrorToEdgeError(input.error);
  if (mappedProviderError) {
    return jsonError({
      traceId: input.traceId,
      kind: mappedProviderError.kind,
      message: mappedProviderError.message,
      details: mappedProviderError.details,
      now: input.now,
      status: mappedProviderError.status,
    });
  }

  if (input.error instanceof Error && input.error.name === "ZodError") {
    return jsonError({
      traceId: input.traceId,
      kind: "internal_error",
      message: "Internal server error",
      details: internalErrorDetails(randomUUID()),
      now: input.now,
      status: 500,
    });
  }

  return jsonError({
    traceId: input.traceId,
    kind: "internal_error",
    message: "Internal server error",
    details: internalErrorDetails(randomUUID()),
    now: input.now,
    status: 500,
  });
}

export async function handleRoute<Contract extends RouteContract>(
  request: NextRequest,
  input: {
    route: Contract;
    params?: RawRouteParams;
    handler: (
      ctx: RequestContext,
      request: NextRequest,
      parsed: ParsedRouteInput<Contract>,
    ) => Promise<unknown>;
  },
) {
  const fallback = { traceId: randomUUID(), now: new Date() };
  let ctx: RequestContext | null = null;

  try {
    ctx = await admitRequest(request, input.route);

    const parsed = await parseRouteInput(request, input.route, input.params);
    const payload = await input.handler(ctx, request, parsed);
    const validatedPayload = input.route.successPayloadSchema.parse(payload);
    return jsonSuccess({
      traceId: ctx.traceId,
      resource: input.route.resource,
      payload: validatedPayload,
      now: ctx.now,
      status: input.route.status,
    });
  } catch (error) {
    return mapErrorToResponse({
      error,
      traceId: ctx?.traceId ?? fallback.traceId,
      now: ctx?.now ?? fallback.now,
    });
  }
}

export async function handleRedirectRoute<Contract extends RouteContract>(
  request: NextRequest,
  input: {
    route: Contract;
    params?: RawRouteParams;
    handler: (
      ctx: RequestContext,
      request: NextRequest,
      parsed: ParsedRouteInput<Contract>,
    ) => Promise<NextResponse>;
  },
) {
  const fallback = { traceId: randomUUID(), now: new Date() };
  let ctx: RequestContext | null = null;

  try {
    ctx = await admitRequest(request, input.route);
    const parsed = await parseRouteInput(request, input.route, input.params);
    const response = await input.handler(ctx, request, parsed);
    response.headers.set("X-Trace-Id", ctx.traceId);
    return response;
  } catch (error) {
    return mapErrorToResponse({
      error,
      traceId: ctx?.traceId ?? fallback.traceId,
      now: ctx?.now ?? fallback.now,
    });
  }
}
