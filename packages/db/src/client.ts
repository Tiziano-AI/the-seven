import { loadServerEnv } from "@the-seven/config";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

export type SevenDatabase = NodePgDatabase<typeof schema>;

export type DatabaseTarget = Readonly<{
  connectionString: string;
  schemaName: string | null;
  allowExitOnIdle: boolean;
  maxConnections: number;
}>;

export type DatabaseClient = Readonly<{
  db: SevenDatabase;
  pool: Pool;
}>;

const DEFAULT_POOL_MAX_CONNECTIONS = 10;
const DEFAULT_POOL_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_POOL_CONNECTION_TIMEOUT_MS = 10_000;

let cachedClient: DatabaseClient | null = null;
let testDatabaseTarget: DatabaseTarget | null = null;

function validateSchemaName(schemaName: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schemaName)) {
    throw new Error(`Invalid PostgreSQL schema name "${schemaName}"`);
  }
  return schemaName;
}

function buildConnectionOptions(schemaName: string | null): string | undefined {
  if (!schemaName) {
    return undefined;
  }

  const validatedSchemaName = validateSchemaName(schemaName);
  return `-c search_path=${validatedSchemaName},public`;
}

function buildPoolConfig(target: DatabaseTarget): PoolConfig {
  return {
    connectionString: target.connectionString,
    max: target.maxConnections,
    idleTimeoutMillis: DEFAULT_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: DEFAULT_POOL_CONNECTION_TIMEOUT_MS,
    allowExitOnIdle: target.allowExitOnIdle,
    options: buildConnectionOptions(target.schemaName),
  };
}

function buildDatabaseTarget(): DatabaseTarget {
  if (testDatabaseTarget) {
    return testDatabaseTarget;
  }

  const env = loadServerEnv();
  return {
    connectionString: env.databaseUrl,
    schemaName: null,
    allowExitOnIdle: false,
    maxConnections: DEFAULT_POOL_MAX_CONNECTIONS,
  };
}

export function createDatabaseClient(target: DatabaseTarget): DatabaseClient {
  const pool = new Pool(buildPoolConfig(target));
  return {
    pool,
    db: drizzle(pool, { schema }),
  };
}

export async function getDatabaseClient(): Promise<DatabaseClient> {
  if (cachedClient) {
    return cachedClient;
  }
  cachedClient = createDatabaseClient(buildDatabaseTarget());
  return cachedClient;
}

export async function getDb(): Promise<SevenDatabase> {
  const client = await getDatabaseClient();
  return client.db;
}

export async function closeDatabaseClient(client: DatabaseClient): Promise<void> {
  await client.pool.end();
}

export function configureDbForTests(target: DatabaseTarget): void {
  testDatabaseTarget = target;
}

export async function resetDbForTests(): Promise<void> {
  if (cachedClient) {
    await closeDatabaseClient(cachedClient);
  }
  cachedClient = null;
  testDatabaseTarget = null;
}
