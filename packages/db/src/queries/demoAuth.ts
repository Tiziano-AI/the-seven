import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../client";
import { demoMagicLinks, demoSessions } from "../schema";

function requireInsertedRow<T>(rows: ReadonlyArray<T>, label: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(`Insert failed for ${label}`);
  }
  return row;
}

export async function createDemoMagicLink(input: {
  userId: number;
  tokenHash: string;
  requestedIp: string;
  expiresAt: Date;
  createdAt: Date;
}) {
  const db = await getDb();
  const inserted = await db
    .insert(demoMagicLinks)
    .values({
      userId: input.userId,
      tokenHash: input.tokenHash,
      requestedIp: input.requestedIp,
      consumedIp: null,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: input.createdAt,
    })
    .returning();

  return requireInsertedRow(inserted, "demo_magic_links");
}

export async function getDemoMagicLinkByTokenHash(tokenHash: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(demoMagicLinks)
    .where(eq(demoMagicLinks.tokenHash, tokenHash))
    .limit(1);
  return rows[0] ?? null;
}

export async function markDemoMagicLinkUsed(input: {
  id: number;
  usedAt: Date;
  consumedIp: string | null;
}): Promise<boolean> {
  const db = await getDb();
  const updated = await db
    .update(demoMagicLinks)
    .set({
      usedAt: input.usedAt,
      consumedIp: input.consumedIp,
    })
    .where(and(eq(demoMagicLinks.id, input.id), isNull(demoMagicLinks.usedAt)))
    .returning({ id: demoMagicLinks.id });

  return updated.length > 0;
}

export async function createDemoSession(input: {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  lastUsedAt: Date;
  createdAt: Date;
}) {
  const db = await getDb();
  const inserted = await db
    .insert(demoSessions)
    .values({
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      lastUsedAt: input.lastUsedAt,
      revokedAt: null,
      createdAt: input.createdAt,
    })
    .returning();

  return requireInsertedRow(inserted, "demo_sessions");
}

export async function getDemoSessionByTokenHash(tokenHash: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(demoSessions)
    .where(and(eq(demoSessions.tokenHash, tokenHash), isNull(demoSessions.revokedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function touchDemoSession(input: { id: number; lastUsedAt: Date }) {
  const db = await getDb();
  await db
    .update(demoSessions)
    .set({ lastUsedAt: input.lastUsedAt })
    .where(and(eq(demoSessions.id, input.id), isNull(demoSessions.revokedAt)));
}

export async function revokeDemoSession(input: { id: number; revokedAt: Date }): Promise<boolean> {
  const db = await getDb();
  const updated = await db
    .update(demoSessions)
    .set({ revokedAt: input.revokedAt })
    .where(and(eq(demoSessions.id, input.id), isNull(demoSessions.revokedAt)))
    .returning({ id: demoSessions.id });

  return updated.length > 0;
}
