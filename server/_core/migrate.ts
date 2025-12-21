import "dotenv/config";

import path from "path";
import { fileURLToPath } from "url";
import { errorToLogFields, log } from "./log";
import { loadSqlitePath } from "./runtimeConfig";
import { applyBaselineSqliteMigration } from "./sqliteMigrations";
import { openSqliteClient, resolveSqlitePath } from "../stores/sqliteClient";

const BASELINE_MIGRATION_TAG = "0000_init";

function repoRootFromModuleUrl(moduleUrl: string): string {
  const modulePath = fileURLToPath(moduleUrl);
  const moduleDir = path.dirname(modulePath);
  // Bundled: dist/migrate.js -> go up 1 level
  // Source: server/_core/migrate.ts -> go up 2 levels
  const isBundled = moduleDir.endsWith("dist");
  return isBundled ? path.resolve(moduleDir, "..") : path.resolve(moduleDir, "..", "..");
}

async function main(): Promise<void> {
  const resolvedPath = resolveSqlitePath(loadSqlitePath());
  const db = openSqliteClient(resolvedPath);

  try {
    const repoRoot = repoRootFromModuleUrl(import.meta.url);
    const migrationPath = path.join(repoRoot, "drizzle", "0000_init.sql");
    const result = applyBaselineSqliteMigration({
      db,
      migrationPath,
      tag: BASELINE_MIGRATION_TAG,
      requiredTables: [
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
      ],
      onStart: (statementCount) => {
        log("info", "db_migration_start", {
          tag: BASELINE_MIGRATION_TAG,
          statement_count: statementCount,
        });
      },
    });

    if (!result.applied) {
      log("info", "db_migration_noop", { tag: BASELINE_MIGRATION_TAG });
      return;
    }

    log("info", "db_migration_applied", { tag: BASELINE_MIGRATION_TAG });
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  log("error", "db_migration_failed", errorToLogFields(error));
  process.exitCode = 1;
});
