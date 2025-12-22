import { INGRESS_FLOOD_LIMITS } from "../domain/ingressLimits";
import { applyRateLimit, type RateLimitDecision } from "./rateLimits";

function scopeFor(suffix: string): string {
  return `ingress:flood:${suffix}`;
}

/**
 * Applies coarse flood guard limits for inbound API requests.
 */
export async function checkIngressFloodLimits(params: {
  ip: string | null;
  now: Date;
}): Promise<RateLimitDecision | null> {
  const scopes: Array<{ label: string; limit: number; windowSeconds: number }> = [
    { label: scopeFor("global"), ...INGRESS_FLOOD_LIMITS.global },
  ];

  if (params.ip) {
    scopes.push({ label: scopeFor(`ip:${params.ip}`), ...INGRESS_FLOOD_LIMITS.perIp });
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
