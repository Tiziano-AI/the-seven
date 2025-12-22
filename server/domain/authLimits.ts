import { DAY_SECONDS, type RateLimitSpec } from "./rateLimitSpecs";

/**
 * Rate limit spec for OpenRouter key validation requests.
 */
export type AuthValidateRateLimitSpec = Readonly<{
  perByokId: RateLimitSpec;
  perIp: RateLimitSpec;
  global: RateLimitSpec;
}>;

/**
 * Rate limits for OpenRouter key validation requests.
 */
export const AUTH_VALIDATE_LIMITS: AuthValidateRateLimitSpec = {
  perByokId: { limit: 10, windowSeconds: DAY_SECONDS },
  perIp: { limit: 30, windowSeconds: DAY_SECONDS },
  global: { limit: 1000, windowSeconds: DAY_SECONDS },
};
