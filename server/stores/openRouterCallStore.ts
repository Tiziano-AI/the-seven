import { asc, eq } from "drizzle-orm";
import { openRouterCalls, type InsertOpenRouterCall, type OpenRouterCall } from "../../drizzle/schema";
import { getDb } from "./dbClient";

/**
 * Persists a single OpenRouter call diagnostic record.
 */
export async function createOpenRouterCall(call: InsertOpenRouterCall): Promise<void> {
  const db = await getDb();
  await db.insert(openRouterCalls).values(call);
}

/**
 * Loads all OpenRouter call records for a session in chronological order.
 */
export async function getOpenRouterCallsBySessionId(sessionId: number): Promise<OpenRouterCall[]> {
  const db = await getDb();
  return await db
    .select()
    .from(openRouterCalls)
    .where(eq(openRouterCalls.sessionId, sessionId))
    .orderBy(asc(openRouterCalls.createdAt), asc(openRouterCalls.id));
}
