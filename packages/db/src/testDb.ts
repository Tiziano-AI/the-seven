import { randomUUID } from "node:crypto";
import { loadServerEnv } from "@the-seven/config";
import {
  closeDatabaseClient,
  configureDbForTests,
  createDatabaseClient,
  resetDbForTests,
} from "./client";
import { runMigrationsForTarget } from "./migrate";

let activeTestSchemaName: string | null = null;
const TEST_DB_MAX_ATTEMPTS = 4;

function buildTestSchemaName(): string {
  return `seven_test_${randomUUID().replaceAll("-", "_")}`;
}

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL identifier "${identifier}"`);
  }
  return `"${identifier}"`;
}

function isRetryableConnectionReset(error: unknown): boolean {
  return error instanceof Error && error.message.includes("ECONNRESET");
}

function retryDelayMs(attempt: number): number {
  return Math.min(1_200, 250 * 2 ** Math.max(0, attempt - 1));
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withAdminClient<T>(
  connectionString: string,
  run: (client: ReturnType<typeof createDatabaseClient>) => Promise<T>,
): Promise<T> {
  const client = createDatabaseClient({
    connectionString,
    schemaName: null,
    allowExitOnIdle: true,
    maxConnections: 1,
  });
  try {
    return await run(client);
  } finally {
    await closeDatabaseClient(client);
  }
}

async function createSchema(connectionString: string, schemaName: string): Promise<void> {
  await withAdminClient(connectionString, async (client) => {
    await client.pool.query(`create schema ${quoteIdentifier(schemaName)}`);
  });
}

async function dropSchema(connectionString: string, schemaName: string): Promise<void> {
  await withAdminClient(connectionString, async (client) => {
    await client.pool.query(`drop schema if exists ${quoteIdentifier(schemaName)} cascade`);
  });
}

async function dropSchemaBestEffort(connectionString: string, schemaName: string): Promise<void> {
  try {
    await dropSchema(connectionString, schemaName);
  } catch {
    // Isolated randomized schemas are safe to abandon on teardown failure.
  }
}

export async function setupTestDatabase(): Promise<string> {
  await teardownTestDatabase();
  const connectionString = loadServerEnv().databaseUrl;

  for (let attempt = 1; attempt <= TEST_DB_MAX_ATTEMPTS; attempt += 1) {
    const schemaName = buildTestSchemaName();
    try {
      await createSchema(connectionString, schemaName);
      await runMigrationsForTarget(connectionString, schemaName);
      configureDbForTests({
        connectionString,
        schemaName,
        allowExitOnIdle: true,
        maxConnections: 4,
      });
      activeTestSchemaName = schemaName;
      return schemaName;
    } catch (error) {
      await dropSchemaBestEffort(connectionString, schemaName);
      if (!isRetryableConnectionReset(error) || attempt === TEST_DB_MAX_ATTEMPTS) {
        throw error;
      }
      await sleepMs(retryDelayMs(attempt));
    }
  }

  throw new Error("Test database setup failed: retry loop exhausted");
}

export async function teardownTestDatabase(): Promise<void> {
  await resetDbForTests();
  if (!activeTestSchemaName) {
    return;
  }

  const schemaName = activeTestSchemaName;
  activeTestSchemaName = null;
  const connectionString = loadServerEnv().databaseUrl;

  for (let attempt = 1; attempt <= TEST_DB_MAX_ATTEMPTS; attempt += 1) {
    try {
      await dropSchema(connectionString, schemaName);
      return;
    } catch (error) {
      if (!isRetryableConnectionReset(error) || attempt === TEST_DB_MAX_ATTEMPTS) {
        throw error;
      }
      await sleepMs(retryDelayMs(attempt));
    }
  }
}
