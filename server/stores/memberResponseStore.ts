import { asc, eq } from "drizzle-orm";
import {
  memberResponses,
  type InsertMemberResponse,
  type MemberResponse,
} from "../../drizzle/schema";
import { getDb } from "./dbClient";

/**
 * Writes a Phase 1 member response idempotently.
 */
export async function createMemberResponse(response: InsertMemberResponse): Promise<void> {
  const db = await getDb();
  await db
    .insert(memberResponses)
    .values(response)
    .onConflictDoNothing({
      target: [memberResponses.sessionId, memberResponses.memberPosition],
    });
}

/**
 * Loads all member responses for a session in canonical slot order.
 */
export async function getMemberResponsesBySessionId(
  sessionId: number
): Promise<MemberResponse[]> {
  const db = await getDb();
  return await db
    .select()
    .from(memberResponses)
    .where(eq(memberResponses.sessionId, sessionId))
    .orderBy(asc(memberResponses.memberPosition));
}
