import { and, eq, sql } from "drizzle-orm";
import { rateLimitBuckets } from "../../drizzle/schema";
import { getDb } from "./dbClient";

/**
 * Increments the bucket counter and returns the new count.
 */
export async function incrementRateLimitBucket(params: {
  scope: string;
  windowStart: Date;
  windowSeconds: number;
  now: Date;
}): Promise<number> {
  const db = await getDb();
  const inserted = await db
    .insert(rateLimitBuckets)
    .values({
      scope: params.scope,
      windowStart: params.windowStart,
      windowSeconds: params.windowSeconds,
      count: 1,
      createdAt: params.now,
      updatedAt: params.now,
    })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.scope, rateLimitBuckets.windowStart],
      set: {
        count: sql`${rateLimitBuckets.count} + 1`,
        updatedAt: params.now,
      },
    })
    .returning({ count: rateLimitBuckets.count });

  const row = inserted[0];
  if (!row) {
    throw new Error("Failed to increment rate limit bucket");
  }
  return row.count;
}

/**
 * Loads the current bucket count for a scope and window.
 */
export async function getRateLimitBucketCount(params: {
  scope: string;
  windowStart: Date;
}): Promise<number> {
  const db = await getDb();
  const result = await db
    .select({ count: rateLimitBuckets.count })
    .from(rateLimitBuckets)
    .where(
      and(
        eq(rateLimitBuckets.scope, params.scope),
        eq(rateLimitBuckets.windowStart, params.windowStart)
      )
    )
    .limit(1);
  return result.length > 0 ? result[0].count : 0;
}
