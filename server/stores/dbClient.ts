import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../../drizzle/schema";
import { requireServerRuntimeConfig } from "../_core/runtimeConfig";
import { openSqliteClient, resolveSqlitePath } from "./sqliteClient";

type SqliteDb = BetterSQLite3Database<typeof schema>;

let cachedDb: SqliteDb | null = null;
let cachedClient: Database.Database | null = null;

/**
 * Returns the singleton Drizzle SQLite database for this process.
 */
export async function getDb(): Promise<SqliteDb> {
  if (cachedDb) return cachedDb;

  const runtime = requireServerRuntimeConfig();
  const resolvedPath = resolveSqlitePath(runtime.sqlite.path);
  cachedClient = openSqliteClient(resolvedPath);
  cachedDb = drizzle(cachedClient, { schema });

  return cachedDb;
}

/**
 * Resets the cached SQLite client for test isolation.
 */
export function resetDbForTests(): void {
  if (cachedClient) {
    cachedClient.close();
  }
  cachedClient = null;
  cachedDb = null;
}
