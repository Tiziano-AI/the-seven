import { and, eq, inArray, sql } from "drizzle-orm";
import { sessions, type InsertSession, type Session } from "../../drizzle/schema";
import { getDb } from "./dbClient";

/**
 * Canonical session status vocabulary.
 */
export type SessionStatus = "pending" | "processing" | "completed" | "failed";

/**
 * Non-terminal session statuses eligible for reconciliation.
 */
export type NonTerminalSessionStatus = "pending" | "processing";

/**
 * Canonical failure vocabulary for failed sessions.
 */
export type SessionFailureKind =
  | "server_restart"
  | "phase1_inference_failed"
  | "phase2_inference_failed"
  | "phase3_inference_failed"
  | "invalid_run_spec"
  | "concurrent_execution"
  | "openrouter_rate_limited"
  | "internal_error";

/**
 * Summary of reconciliation work at startup.
 */
export type SessionReconciliationSummary = Readonly<{
  pendingCount: number;
  processingCount: number;
}>;

function parseCount(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return 0;
}

/**
 * Creates a new session row and returns the generated id.
 */
export async function createSession(session: InsertSession): Promise<number> {
  const db = await getDb();
  const inserted = await db
    .insert(sessions)
    .values(session)
    .returning({ id: sessions.id });
  const id = inserted[0]?.id;
  if (!id) {
    throw new Error("Failed to insert session");
  }
  return id;
}

/**
 * Loads all sessions for a user in creation order.
 */
export async function getSessionsByUserId(userId: number): Promise<Session[]> {
  const db = await getDb();
  return await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(sessions.createdAt);
}

/**
 * Loads a session by id.
 */
export async function getSessionById(sessionId: number): Promise<Session | null> {
  const db = await getDb();
  const result = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

/**
 * Attempts to transition a session to processing.
 */
export async function tryStartSessionProcessing(sessionId: number): Promise<boolean> {
  const db = await getDb();

  const updated = await db
    .update(sessions)
    .set({ status: "processing", failureKind: null, updatedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), inArray(sessions.status, ["pending", "failed"])))
    .returning({ id: sessions.id });

  if (updated.length === 0) return false;
  if (updated.length === 1) return true;
  throw new Error(`Session status update affected ${updated.length} rows (expected 0 or 1)`);
}

/**
 * Marks a session as completed.
 */
export async function markSessionCompleted(sessionId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(sessions)
    .set({ status: "completed", failureKind: null, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

/**
 * Marks a session as failed with a failure kind.
 */
export async function markSessionFailed(
  sessionId: number,
  failureKind: SessionFailureKind
): Promise<void> {
  const db = await getDb();
  await db
    .update(sessions)
    .set({ status: "failed", failureKind, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

type DbClient = Awaited<ReturnType<typeof getDb>>;

async function countSessionsByStatus(db: DbClient, status: NonTerminalSessionStatus): Promise<number> {
  const rows = await db
    .select({
      count: sql<unknown>`count(*)`,
    })
    .from(sessions)
    .where(eq(sessions.status, status));

  return parseCount(rows[0]?.count);
}

/**
 * Reconciles sessions left in non-terminal states after a restart.
 */
export async function reconcileNonTerminalSessionsToFailed(): Promise<SessionReconciliationSummary> {
  const db = await getDb();
  const [pendingCount, processingCount] = await Promise.all([
    countSessionsByStatus(db, "pending"),
    countSessionsByStatus(db, "processing"),
  ]);

  if (pendingCount + processingCount === 0) {
    return { pendingCount, processingCount };
  }

  await db
    .update(sessions)
    .set({ status: "failed", failureKind: "server_restart", updatedAt: new Date() })
    .where(inArray(sessions.status, ["pending", "processing"]));

  return { pendingCount, processingCount };
}
