import { and, eq } from "drizzle-orm";
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

export async function getRateLimitBucket(input: {
  scope: string;
  now: Date;
  windowSeconds: number;
}) {
  const db = await getDb();
  const windowStart = floorWindowStart(input.now, input.windowSeconds);
  const rows = await db
    .select()
    .from(rateLimitBuckets)
    .where(
      and(eq(rateLimitBuckets.scope, input.scope), eq(rateLimitBuckets.windowStart, windowStart)),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function incrementRateLimitBucket(input: {
  scope: string;
  now: Date;
  windowSeconds: number;
}) {
  const db = await getDb();
  const windowStart = floorWindowStart(input.now, input.windowSeconds);
  const existing = await getRateLimitBucket(input);

  if (!existing) {
    const inserted = await db
      .insert(rateLimitBuckets)
      .values({
        scope: input.scope,
        windowStart,
        windowSeconds: input.windowSeconds,
        count: 1,
      })
      .returning();
    return requireRow(inserted, "rate_limit_buckets.insert");
  }

  const updated = await db
    .update(rateLimitBuckets)
    .set({
      count: existing.count + 1,
      updatedAt: input.now,
    })
    .where(eq(rateLimitBuckets.id, existing.id))
    .returning();

  return requireRow(updated, "rate_limit_buckets.update");
}
