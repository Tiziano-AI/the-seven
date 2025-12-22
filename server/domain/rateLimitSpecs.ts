/**
 * Canonical primitives for fixed-window rate limit specifications.
 */
/**
 * Fixed-window limit configuration.
 */
export type RateLimitSpec = Readonly<{
  limit: number;
  windowSeconds: number;
}>;

/**
 * Seconds in a 24-hour day for fixed-window limits.
 */
export const DAY_SECONDS = 24 * 60 * 60;

/**
 * Seconds in a 60-second minute for fixed-window limits.
 */
export const MINUTE_SECONDS = 60;
