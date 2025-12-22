import { AUTH_VALIDATE_LIMITS } from "../domain/authLimits";
import { applyRateLimit, type RateLimitDecision } from "./rateLimits";

type AuthRateLimitKind = "validate";

function scopeFor(kind: AuthRateLimitKind, suffix: string): string {
  return `auth:${kind}:${suffix}`;
}

/**
 * Applies OpenRouter key validation rate limits.
 */
export async function checkAuthValidateLimits(params: {
  byokId: string;
  ip: string | null;
  now: Date;
}): Promise<RateLimitDecision | null> {
  const scopes: Array<{ label: string; limit: number; windowSeconds: number }> = [
    { label: scopeFor("validate", "global"), ...AUTH_VALIDATE_LIMITS.global },
    { label: scopeFor("validate", `byok:${params.byokId}`), ...AUTH_VALIDATE_LIMITS.perByokId },
  ];
  if (params.ip) {
    scopes.push({ label: scopeFor("validate", `ip:${params.ip}`), ...AUTH_VALIDATE_LIMITS.perIp });
  }

  for (const scope of scopes) {
    const decision = await applyRateLimit({
      scope: scope.label,
      limit: scope.limit,
      windowSeconds: scope.windowSeconds,
      now: params.now,
    });
    if (!decision.allowed) {
      return decision;
    }
  }

  return null;
}
