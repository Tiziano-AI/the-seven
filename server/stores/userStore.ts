import { eq } from "drizzle-orm";
import { users, type User } from "../../drizzle/schema";
import { getDb } from "./dbClient";

/**
 * Loads a user by BYOK id.
 */
export async function getUserByByokId(byokId: string): Promise<User | null> {
  const db = await getDb();
  const result = await db
    .select()
    .from(users)
    .where(eq(users.byokId, byokId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

/**
 * Loads a user by demo email.
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

/**
 * Loads a user by internal id.
 */
export async function getUserById(userId: number): Promise<User | null> {
  const db = await getDb();
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

async function createByokUser(byokId: string): Promise<void> {
  const db = await getDb();
  await db
    .insert(users)
    .values({ kind: "byok", byokId })
    .onConflictDoNothing({ target: users.byokId });
}

/**
 * Loads or creates a user for the BYOK id.
 */
export async function getOrCreateUserByokId(byokId: string): Promise<User> {
  const existing = await getUserByByokId(byokId);
  if (existing) {
    return existing;
  }

  await createByokUser(byokId);

  const user = await getUserByByokId(byokId);
  if (!user) {
    throw new Error("Failed to load user record");
  }

  return user;
}

async function createDemoUser(email: string): Promise<void> {
  const db = await getDb();
  await db
    .insert(users)
    .values({ kind: "demo", email })
    .onConflictDoNothing({ target: users.email });
}

/**
 * Loads or creates a demo user for the email.
 */
export async function getOrCreateUserByEmail(email: string): Promise<User> {
  const existing = await getUserByEmail(email);
  if (existing) {
    return existing;
  }

  await createDemoUser(email);

  const user = await getUserByEmail(email);
  if (!user) {
    throw new Error("Failed to load demo user record");
  }

  return user;
}
