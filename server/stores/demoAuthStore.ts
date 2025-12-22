import { eq } from "drizzle-orm";
import {
  demoAuthLinks,
  demoSessions,
  type DemoAuthLink,
  type DemoSession,
  type InsertDemoAuthLink,
  type InsertDemoSession,
} from "../../drizzle/schema";
import { getDb } from "./dbClient";

/**
 * Creates a demo auth link and returns the inserted row.
 */
export async function createDemoAuthLink(link: InsertDemoAuthLink): Promise<DemoAuthLink> {
  const db = await getDb();
  const inserted = await db
    .insert(demoAuthLinks)
    .values(link)
    .returning();
  const row = inserted[0];
  if (!row) {
    throw new Error("Failed to insert demo auth link");
  }
  return row;
}

/**
 * Loads a demo auth link by token hash.
 */
export async function getDemoAuthLinkByTokenHash(
  tokenHash: string
): Promise<DemoAuthLink | null> {
  const db = await getDb();
  const result = await db
    .select()
    .from(demoAuthLinks)
    .where(eq(demoAuthLinks.tokenHash, tokenHash))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

/**
 * Marks a demo auth link as used.
 */
export async function markDemoAuthLinkUsed(params: {
  id: number;
  usedAt: Date;
  consumedIp: string | null;
}): Promise<void> {
  const db = await getDb();
  await db
    .update(demoAuthLinks)
    .set({
      usedAt: params.usedAt,
      consumedIp: params.consumedIp,
    })
    .where(eq(demoAuthLinks.id, params.id));
}

/**
 * Creates a demo session and returns the inserted row.
 */
export async function createDemoSession(session: InsertDemoSession): Promise<DemoSession> {
  const db = await getDb();
  const inserted = await db
    .insert(demoSessions)
    .values(session)
    .returning();
  const row = inserted[0];
  if (!row) {
    throw new Error("Failed to insert demo session");
  }
  return row;
}

/**
 * Loads a demo session by token hash.
 */
export async function getDemoSessionByTokenHash(
  tokenHash: string
): Promise<DemoSession | null> {
  const db = await getDb();
  const result = await db
    .select()
    .from(demoSessions)
    .where(eq(demoSessions.tokenHash, tokenHash))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

/**
 * Updates the last-used timestamp for a demo session.
 */
export async function touchDemoSession(params: { id: number; lastUsedAt: Date }): Promise<void> {
  const db = await getDb();
  await db
    .update(demoSessions)
    .set({ lastUsedAt: params.lastUsedAt })
    .where(eq(demoSessions.id, params.id));
}
