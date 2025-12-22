import { MINUTE_SECONDS, type RateLimitSpec } from "./rateLimitSpecs";

export type IngressFloodLimitSpec = Readonly<{
  perIp: RateLimitSpec;
  global: RateLimitSpec;
}>;

/**
 * Coarse ingress flood guard to mitigate abusive request bursts.
 *
 * This is intentionally generous and independent of BYOK usage; it only trips
 * at clearly abusive volumes.
 */
export const INGRESS_FLOOD_LIMITS: IngressFloodLimitSpec = {
  perIp: { limit: 600, windowSeconds: MINUTE_SECONDS },
  global: { limit: 5000, windowSeconds: MINUTE_SECONDS },
};
