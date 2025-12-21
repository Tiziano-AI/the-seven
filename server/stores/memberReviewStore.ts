import { asc, eq } from "drizzle-orm";
import {
  memberReviews,
  type InsertMemberReview,
  type MemberReview,
} from "../../drizzle/schema";
import { getDb } from "./dbClient";

/**
 * Writes a Phase 2 member review idempotently.
 */
export async function createMemberReview(review: InsertMemberReview): Promise<void> {
  const db = await getDb();
  await db
    .insert(memberReviews)
    .values(review)
    .onConflictDoNothing({
      target: [memberReviews.sessionId, memberReviews.reviewerMemberPosition],
    });
}

/**
 * Loads all member reviews for a session in reviewer order.
 */
export async function getMemberReviewsBySessionId(
  sessionId: number
): Promise<MemberReview[]> {
  const db = await getDb();
  return await db
    .select()
    .from(memberReviews)
    .where(eq(memberReviews.sessionId, sessionId))
    .orderBy(asc(memberReviews.reviewerMemberPosition));
}
