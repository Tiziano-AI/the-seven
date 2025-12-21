import Database from "better-sqlite3";
import fs from "fs";

const MIGRATIONS_TABLE = "__seven_migrations";

/**
 * Result of applying the baseline SQLite migration.
 */
export type SqliteMigrationResult = Readonly<{
  applied: boolean;
  statementCount: number;
}>;

function splitDrizzleSql(sql: string): string[] {
  const parts = sql.split(/-->\s*statement-breakpoint\s*/g);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function parseCount(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return 0;
}

/**
 * Applies the baseline migration if it has not been recorded.
 */
export function applyBaselineSqliteMigration(params: {
  db: Database.Database;
  migrationPath: string;
  tag: string;
  requiredTables: ReadonlyArray<string>;
  onStart?: (statementCount: number) => void;
}): SqliteMigrationResult {
  const { db, migrationPath, tag, requiredTables, onStart } = params;

  db.exec(
    `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
      tag text NOT NULL PRIMARY KEY,
      appliedAt integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
    );`
  );

  const migrationRow = db
    .prepare(`SELECT tag FROM "${MIGRATIONS_TABLE}" WHERE tag = ? LIMIT 1`)
    .get(tag) as { tag?: string } | undefined;

  if (migrationRow?.tag) {
    return { applied: false, statementCount: 0 };
  }

  const tableNames = requiredTables.map((table) => `'${table}'`).join(", ");
  const existingSchemaRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name IN (${tableNames})`
    )
    .get() as { c?: unknown } | undefined;

  const existingCount = parseCount(existingSchemaRow?.c);
  if (existingCount > 0) {
    throw new Error(
      `Refusing to apply ${tag}: database is not empty and migration is not recorded. Drop the schema or insert the migration tag into ${MIGRATIONS_TABLE}.`
    );
  }

  const sqlText = fs.readFileSync(migrationPath, "utf-8");
  const statements = splitDrizzleSql(sqlText);

  onStart?.(statements.length);

  for (const statement of statements) {
    db.exec(statement);
  }

  db.prepare(`INSERT INTO "${MIGRATIONS_TABLE}" (tag) VALUES (?)`).run(tag);

  return { applied: true, statementCount: statements.length };
}
