import { getRateLimitBucketCount, incrementRateLimitBucket } from "../stores/rateLimitStore";

export type RateLimitDecision = Readonly<{
  scope: string;
  limit: number;
  windowSeconds: number;
  count: number;
  remaining: number;
  resetAtMs: number;
  allowed: boolean;
}>;

function windowStartMs(nowMs: number, windowSeconds: number): number {
  const windowMs = windowSeconds * 1000;
  return Math.floor(nowMs / windowMs) * windowMs;
}

/**
 * Applies a fixed-window rate limit and returns the decision.
 */
export async function applyRateLimit(params: {
  scope: string;
  limit: number;
  windowSeconds: number;
  now: Date;
}): Promise<RateLimitDecision> {
  const nowMs = params.now.getTime();
  const startMs = windowStartMs(nowMs, params.windowSeconds);
  const windowStart = new Date(startMs);
  const count = await incrementRateLimitBucket({
    scope: params.scope,
    windowStart,
    windowSeconds: params.windowSeconds,
    now: params.now,
  });
  const remaining = Math.max(0, params.limit - count);
  const resetAtMs = startMs + params.windowSeconds * 1000;
  return {
    scope: params.scope,
    limit: params.limit,
    windowSeconds: params.windowSeconds,
    count,
    remaining,
    resetAtMs,
    allowed: count <= params.limit,
  };
}

/**
 * Returns the projected decision without incrementing the bucket.
 */
export async function previewRateLimit(params: {
  scope: string;
  limit: number;
  windowSeconds: number;
  now: Date;
}): Promise<RateLimitDecision> {
  const nowMs = params.now.getTime();
  const startMs = windowStartMs(nowMs, params.windowSeconds);
  const windowStart = new Date(startMs);
  const currentCount = await getRateLimitBucketCount({
    scope: params.scope,
    windowStart,
  });
  const projectedCount = currentCount + 1;
  const remaining = Math.max(0, params.limit - projectedCount);
  const resetAtMs = startMs + params.windowSeconds * 1000;
  return {
    scope: params.scope,
    limit: params.limit,
    windowSeconds: params.windowSeconds,
    count: projectedCount,
    remaining,
    resetAtMs,
    allowed: projectedCount <= params.limit,
  };
}
