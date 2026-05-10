import { inArray, sql } from "drizzle-orm";
import { getDb } from "../client";
import { rateLimitBuckets } from "../schema";

function requireRow<T>(rows: ReadonlyArray<T>, label: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(`Expected row for ${label}`);
  }
  return row;
}

function floorWindowStart(now: Date, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

export async function admitRateLimitBucket(input: {
  scope: string;
  now: Date;
  windowSeconds: number;
}) {
  const db = await getDb();
  const windowStart = floorWindowStart(input.now, input.windowSeconds);
  const rows = await db
    .insert(rateLimitBuckets)
    .values({
      scope: input.scope,
      windowStart,
      windowSeconds: input.windowSeconds,
      count: 1,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.scope, rateLimitBuckets.windowStart],
      set: {
        count: sql`${rateLimitBuckets.count} + 1`,
        windowSeconds: input.windowSeconds,
        updatedAt: input.now,
      },
    })
    .returning();

  return requireRow(rows, "rate_limit_buckets.admit");
}

export async function deleteRateLimitBucketsForScopes(scopes: readonly string[]) {
  if (scopes.length === 0) {
    return 0;
  }

  const db = await getDb();
  const deleted = await db
    .delete(rateLimitBuckets)
    .where(inArray(rateLimitBuckets.scope, scopes))
    .returning({ id: rateLimitBuckets.id });

  return deleted.length;
}
