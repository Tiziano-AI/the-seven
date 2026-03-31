import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadServerEnv } from "@the-seven/config";
import { closeDatabaseClient, createDatabaseClient } from "./client";

function resolveRepoRoot(startDirectory = process.cwd()): string {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    if (existsSync(path.join(currentDirectory, "pnpm-workspace.yaml"))) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      throw new Error("Unable to locate workspace root from current working directory");
    }
    currentDirectory = parentDirectory;
  }
}

function resolveMigrationsFolder(): string {
  return path.join(resolveRepoRoot(), "packages", "db", "drizzle");
}

function resolveInitSqlPath(): string {
  return path.resolve(resolveMigrationsFolder(), "0000_init.sql");
}

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL identifier "${identifier}"`);
  }
  return `"${identifier}"`;
}

async function runIsolatedSchemaInitSql(
  connectionString: string,
  schemaName: string | null,
): Promise<void> {
  const client = createDatabaseClient({
    connectionString,
    schemaName,
    allowExitOnIdle: true,
    maxConnections: 1,
  });

  const initSql = await readFile(resolveInitSqlPath(), "utf8");
  const normalizedSql = schemaName
    ? initSql.replaceAll('"public".', `${quoteIdentifier(schemaName)}.`)
    : initSql;
  const statements = normalizedSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  const connection = await client.pool.connect();
  try {
    await connection.query("begin");
    for (const statement of statements) {
      await connection.query(statement);
    }
    await connection.query("commit");
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally {
    connection.release();
    await closeDatabaseClient(client);
  }
}

export async function runMigrations(): Promise<void> {
  const env = loadServerEnv();
  await runIsolatedSchemaInitSql(env.databaseUrl, null);
}

export async function runMigrationsForTarget(
  connectionString: string,
  schemaName?: string,
): Promise<void> {
  await runIsolatedSchemaInitSql(connectionString, schemaName ?? null);
}
