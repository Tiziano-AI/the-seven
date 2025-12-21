import { randomUUID } from "crypto";
import path from "path";
import { applyBaselineSqliteMigration } from "../_core/sqliteMigrations";
import { resetServerRuntimeConfigForTests } from "../_core/runtimeConfig";
import { resetDbForTests } from "./dbClient";
import { openSqliteClient, resolveSqlitePath } from "./sqliteClient";

const BASELINE_MIGRATION_TAG = "0000_init";
const REQUIRED_TABLES = [
  "users",
  "councils",
  "councilMembers",
  "sessions",
  "memberResponses",
  "memberReviews",
  "memberSyntheses",
  "modelsCache",
  "pricingCache",
  "openRouterCalls",
] as const;

/**
 * Creates a fresh SQLite database for tests and applies the baseline migration.
 */
export function setupTestDatabase(): string {
  const dbPath = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "tmp",
    `seven-test-${randomUUID()}.db`
  );

  process.env.SEVEN_DB_PATH = dbPath;
  resetServerRuntimeConfigForTests();
  resetDbForTests();

  const resolvedPath = resolveSqlitePath(dbPath);
  const db = openSqliteClient(resolvedPath);

  try {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "..",
      "..",
      "drizzle",
      "0000_init.sql"
    );
    applyBaselineSqliteMigration({
      db,
      migrationPath,
      tag: BASELINE_MIGRATION_TAG,
      requiredTables: REQUIRED_TABLES,
    });
  } finally {
    db.close();
  }

  return dbPath;
}
