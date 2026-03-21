import "server-only";

import type { RateLimitSpec } from "@the-seven/config";
import { getRateLimitBucket, incrementRateLimitBucket } from "@the-seven/db";

function buildDecision(input: {
  scope: string;
  spec: RateLimitSpec;
  bucketCount: number;
  bucketWindowStart: Date;
}) {
  if (input.bucketCount <= input.spec.limit) {
    return null;
  }

  const resetAtMs = input.bucketWindowStart.getTime() + input.spec.windowSeconds * 1000;
  return {
    scope: input.scope,
    limit: input.spec.limit,
    windowSeconds: input.spec.windowSeconds,
    resetAtMs,
  };
}

export async function previewFixedWindowLimit(input: {
  scope: string;
  spec: RateLimitSpec;
  now: Date;
}) {
  const bucket = await getRateLimitBucket({
    scope: input.scope,
    now: input.now,
    windowSeconds: input.spec.windowSeconds,
  });

  return buildDecision({
    scope: input.scope,
    spec: input.spec,
    bucketCount: bucket?.count ?? 0,
    bucketWindowStart: bucket?.windowStart ?? input.now,
  });
}

export async function applyFixedWindowLimit(input: {
  scope: string;
  spec: RateLimitSpec;
  now: Date;
}) {
  const bucket = await incrementRateLimitBucket({
    scope: input.scope,
    now: input.now,
    windowSeconds: input.spec.windowSeconds,
  });

  return buildDecision({
    scope: input.scope,
    spec: input.spec,
    bucketCount: bucket.count,
    bucketWindowStart: bucket.windowStart,
  });
}
