import { EdgeError } from "./errors";
import { requireServerRuntimeConfig } from "../../_core/runtimeConfig";
import { OpenRouterRequestFailedError, validateOpenRouterApiKey } from "../../adapters/openrouter/client";
import { checkAuthValidateLimits } from "../../services/authRateLimits";
import type { RequestContext } from "./context";

export type ValidateKeyResponse = Readonly<{ valid: boolean }>;

export async function handleValidateKey(ctx: RequestContext): Promise<ValidateKeyResponse> {
  const authHeader = ctx.auth;
  if (authHeader.kind !== "byok") {
    const reason = authHeader.kind === "invalid" ? authHeader.reason : "missing_auth";
    throw new EdgeError({
      kind: "unauthorized",
      message: "Missing OpenRouter API key",
      details: { reason },
      status: 401,
    });
  }

  const limit = await checkAuthValidateLimits({
    byokId: authHeader.byokId,
    ip: ctx.ip,
    now: ctx.now,
  });
  if (limit) {
    throw new EdgeError({
      kind: "rate_limited",
      message: "Auth validation rate limit exceeded",
      details: {
        scope: limit.scope,
        limit: limit.limit,
        windowSeconds: limit.windowSeconds,
        resetAt: new Date(limit.resetAtMs).toISOString(),
      },
      status: 429,
    });
  }

  const runtime = requireServerRuntimeConfig();
  if (runtime.nodeEnv === "development" && runtime.dev.disableOpenRouterKeyValidation) {
    return { valid: true };
  }

  try {
    const valid = await validateOpenRouterApiKey(authHeader.openRouterKey);
    return { valid };
  } catch (error: unknown) {
    const status = error instanceof OpenRouterRequestFailedError ? error.status : null;
    throw new EdgeError({
      kind: "upstream_error",
      message: error instanceof Error ? error.message : "OpenRouter request failed",
      details: { service: "openrouter", status },
      status: 502,
    });
  }
}
