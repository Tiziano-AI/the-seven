import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { users } from "../schema";

export type UserKind = "byok" | "demo";
export type UserRecord = typeof users.$inferSelect;

function requireInsertedRow<T>(rows: ReadonlyArray<T>, label: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(`Insert failed for ${label}`);
  }
  return row;
}

function normalizePrincipal(kind: UserKind, principal: string): string {
  const trimmed = principal.trim();
  return kind === "demo" ? trimmed.toLowerCase() : trimmed;
}

export async function getUserById(userId: number) {
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function getOrCreateUser(input: { kind: UserKind; principal: string }) {
  const db = await getDb();
  const principal = normalizePrincipal(input.kind, input.principal);

  const inserted = await db
    .insert(users)
    .values({
      kind: input.kind,
      principal,
    })
    .onConflictDoUpdate({
      target: [users.kind, users.principal],
      set: {
        updatedAt: new Date(),
      },
    })
    .returning();

  return requireInsertedRow(inserted, "users");
}
