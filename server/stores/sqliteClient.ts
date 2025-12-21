import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const IN_MEMORY_DB = ":memory:";

/**
 * Resolves the SQLite database path to an absolute path.
 */
export function resolveSqlitePath(dbPath: string): string {
  if (dbPath === IN_MEMORY_DB) return dbPath;
  if (path.isAbsolute(dbPath)) return dbPath;
  return path.resolve(process.cwd(), dbPath);
}

function ensureDatabaseDir(resolvedPath: string): void {
  if (resolvedPath === IN_MEMORY_DB) return;
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
}

/**
 * Applies canonical SQLite pragmas for runtime durability and concurrency.
 */
export function configureSqliteClient(client: Database.Database): void {
  client.pragma("journal_mode = WAL");
  client.pragma("synchronous = FULL");
  client.pragma("foreign_keys = ON");
  client.pragma("busy_timeout = 5000");
}

/**
 * Opens a SQLite client for the resolved database path.
 */
export function openSqliteClient(resolvedPath: string): Database.Database {
  ensureDatabaseDir(resolvedPath);
  const client = new Database(resolvedPath);
  configureSqliteClient(client);
  return client;
}
