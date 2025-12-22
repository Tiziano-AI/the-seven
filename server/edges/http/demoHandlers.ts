import { parseJsonBody } from "./parse";
import type { RequestContext } from "./context";
import { EdgeError } from "./errors";
import { requireServerRuntimeConfig } from "../../_core/runtimeConfig";
import {
  checkDemoConsumeLimits,
  checkDemoEmailRequestLimits,
  recordDemoEmailRequest,
} from "../../services/demoRateLimits";
import { requestDemoAuthLink, consumeDemoAuthLink, DemoAuthError } from "../../services/demoAuth";
import { demoConsumeBodySchema, demoRequestBodySchema } from "../../../shared/domain/apiSchemas";

export type DemoRequestResponse = Readonly<{ email: string }>;

export type DemoConsumeResponse = Readonly<{
  email: string;
  token: string;
  expiresAt: number;
}>;

export async function handleDemoRequest(ctx: RequestContext, body: unknown): Promise<DemoRequestResponse> {
  const input = parseJsonBody(demoRequestBodySchema, body);
  const normalizedEmail = input.email.trim().toLowerCase();
  const runtime = requireServerRuntimeConfig();

  if (!runtime.demo.enabled) {
    throw new EdgeError({
      kind: "forbidden",
      message: "Demo mode is disabled",
      details: { reason: "demo_disabled" },
      status: 403,
    });
  }

  const limit = await checkDemoEmailRequestLimits({
    email: normalizedEmail,
    ip: ctx.ip,
    now: ctx.now,
  });
  if (limit) {
    throw new EdgeError({
      kind: "rate_limited",
      message: "Demo email rate limit exceeded",
      details: {
        scope: limit.scope,
        limit: limit.limit,
        windowSeconds: limit.windowSeconds,
        resetAt: new Date(limit.resetAtMs).toISOString(),
      },
      status: 429,
    });
  }

  try {
    const result = await requestDemoAuthLink({
      email: normalizedEmail,
      requestIp: ctx.ip,
      now: ctx.now,
    });
    await recordDemoEmailRequest({
      email: normalizedEmail,
      ip: ctx.ip,
      now: ctx.now,
    });
    return result;
  } catch (error: unknown) {
    if (error instanceof DemoAuthError) {
      if (error.kind === "demo_disabled") {
        throw new EdgeError({
          kind: "forbidden",
          message: "Demo mode is disabled",
          details: { reason: "demo_disabled" },
          status: 403,
        });
      }
      if (error.kind === "email_send_failed") {
        throw new EdgeError({
          kind: "upstream_error",
          message: error.message,
          details: { service: "resend", status: error.status },
          status: 502,
        });
      }
    }
    throw error;
  }
}

export async function handleDemoConsume(ctx: RequestContext, body: unknown): Promise<DemoConsumeResponse> {
  const input = parseJsonBody(demoConsumeBodySchema, body);
  const limit = await checkDemoConsumeLimits({
    ip: ctx.ip,
    now: ctx.now,
  });
  if (limit) {
    throw new EdgeError({
      kind: "rate_limited",
      message: "Demo token rate limit exceeded",
      details: {
        scope: limit.scope,
        limit: limit.limit,
        windowSeconds: limit.windowSeconds,
        resetAt: new Date(limit.resetAtMs).toISOString(),
      },
      status: 429,
    });
  }
  try {
    const result = await consumeDemoAuthLink({
      token: input.token,
      consumedIp: ctx.ip,
      now: ctx.now,
    });
    return {
      email: result.email,
      token: result.token,
      expiresAt: result.expiresAt,
    };
  } catch (error: unknown) {
    if (error instanceof DemoAuthError) {
      if (error.kind === "demo_disabled") {
        throw new EdgeError({
          kind: "forbidden",
          message: "Demo mode is disabled",
          details: { reason: "demo_disabled" },
          status: 403,
        });
      }
      if (error.kind === "link_not_found" || error.kind === "link_used") {
        throw new EdgeError({
          kind: "unauthorized",
          message: "Invalid demo link",
          details: { reason: "invalid_token" },
          status: 401,
        });
      }
      if (error.kind === "link_expired") {
        throw new EdgeError({
          kind: "unauthorized",
          message: "Demo link expired",
          details: { reason: "expired_token" },
          status: 401,
        });
      }
    }
    throw error;
  }
}
