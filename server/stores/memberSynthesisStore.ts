import { and, eq } from "drizzle-orm";
import {
  memberSyntheses,
  type InsertMemberSynthesis,
  type MemberSynthesis,
} from "../../drizzle/schema";
import { getDb } from "./dbClient";

/**
 * Writes the Phase 3 synthesis idempotently.
 */
export async function createMemberSynthesis(synthesis: InsertMemberSynthesis): Promise<void> {
  const db = await getDb();
  await db
    .insert(memberSyntheses)
    .values(synthesis)
    .onConflictDoNothing({
      target: [memberSyntheses.sessionId, memberSyntheses.memberPosition],
    });
}

/**
 * Loads the synthesizer output for a session.
 */
export async function getMemberSynthesisBySessionId(
  sessionId: number
): Promise<MemberSynthesis | null> {
  const db = await getDb();
  const result = await db
    .select()
    .from(memberSyntheses)
    .where(and(eq(memberSyntheses.sessionId, sessionId), eq(memberSyntheses.memberPosition, 7)))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}
