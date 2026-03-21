import { and, eq } from "drizzle-orm";
import { getDb } from "../client";
import { users } from "../schema";

function requireInsertedRow<T>(rows: ReadonlyArray<T>, label: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(`Insert failed for ${label}`);
  }
  return row;
}

export async function getUserById(userId: number) {
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function getOrCreateUserByokId(byokId: string) {
  const db = await getDb();
  const existing = await db.select().from(users).where(eq(users.byokId, byokId)).limit(1);
  if (existing[0]) {
    return existing[0];
  }

  const inserted = await db
    .insert(users)
    .values({
      kind: "byok",
      byokId,
      email: null,
    })
    .returning();

  return requireInsertedRow(inserted, "users.byok");
}

export async function getOrCreateUserByEmail(email: string) {
  const db = await getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existing[0]) {
    return existing[0];
  }

  const inserted = await db
    .insert(users)
    .values({
      kind: "demo",
      email: normalizedEmail,
      byokId: null,
    })
    .returning();

  return requireInsertedRow(inserted, "users.demo");
}

export async function assertByokUser(userId: number, byokId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.kind, "byok"), eq(users.byokId, byokId)))
    .limit(1);
  return rows[0] ?? null;
}
