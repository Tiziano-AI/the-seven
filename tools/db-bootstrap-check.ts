import { randomUUID } from "node:crypto";
import { BUILT_IN_COUNCILS, serverRuntime } from "@the-seven/config";
import { closeDatabaseClient, createDatabaseClient, type DatabaseClient } from "@the-seven/db";
import { runMigrationsForTarget } from "@the-seven/db/migrate";
import {
  EXPECTED_BILLING_LOOKUP_LABELS,
  EXPECTED_ENUMS,
  EXPECTED_TABLES,
  expectedColumnRefs,
} from "./local-db-schema";
import {
  describeCanonicalLocalPostgresPort,
  formatCanonicalLocalPostgresBootstrapMessage,
  isCanonicalLocalPostgresConnectionFailure,
  readCanonicalLocalPostgresStatus,
} from "./local-postgres";

function buildSchemaName() {
  return `seven_bootstrap_${randomUUID().replaceAll("-", "_")}`;
}

function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL identifier "${identifier}"`);
  }
  return `"${identifier}"`;
}

async function withAdminClient<T>(
  connectionString: string,
  run: (client: DatabaseClient) => Promise<T>,
) {
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

async function createSchema(connectionString: string, schemaName: string) {
  await withAdminClient(connectionString, async (client) => {
    await client.pool.query(`create schema ${quoteIdentifier(schemaName)}`);
  });
}

async function dropSchema(connectionString: string, schemaName: string) {
  await withAdminClient(connectionString, async (client) => {
    await client.pool.query(`drop schema if exists ${quoteIdentifier(schemaName)} cascade`);
  });
}

async function listObjects(
  client: DatabaseClient,
  schemaName: string,
  table: "information_schema.tables" | "information_schema.columns" | "pg_type",
) {
  if (table === "information_schema.tables") {
    const result = await client.pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = $1 order by table_name",
      [schemaName],
    );
    return result.rows.map((row) => row.table_name);
  }

  if (table === "information_schema.columns") {
    const result = await client.pool.query<{ table_name: string; column_name: string }>(
      "select table_name, column_name from information_schema.columns where table_schema = $1 order by table_name, column_name",
      [schemaName],
    );
    return result.rows.map((row) => `${row.table_name}.${row.column_name}`);
  }

  const result = await client.pool.query<{ typname: string }>(
    `select t.typname
       from pg_type t
       join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = $1
        and t.typtype = 'e'
      order by t.typname`,
    [schemaName],
  );
  return result.rows.map((row) => row.typname);
}

async function listEnumLabels(client: DatabaseClient, schemaName: string, enumName: string) {
  const result = await client.pool.query<{ enumlabel: string }>(
    `select e.enumlabel
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = $1
        and t.typname = $2
      order by e.enumsortorder`,
    [schemaName, enumName],
  );
  return result.rows.map((row) => row.enumlabel);
}

function requireMembersOnBuiltIns() {
  for (const council of Object.values(BUILT_IN_COUNCILS)) {
    if (council.members.length !== 7) {
      throw new Error(`Built-in council "${council.slug}" does not define all 7 members`);
    }
  }
}

function requireExpectedSet(
  label: string,
  actual: ReadonlyArray<string>,
  expected: ReadonlyArray<string>,
) {
  const actualSet = new Set(actual);
  const missing = expected.filter((value) => !actualSet.has(value));
  if (missing.length > 0) {
    throw new Error(`${label} missing: ${missing.join(", ")}`);
  }
}

async function verifyBootstrap(connectionString: string, schemaName: string) {
  const client = createDatabaseClient({
    connectionString,
    schemaName,
    allowExitOnIdle: true,
    maxConnections: 1,
  });

  try {
    const tableNames = await listObjects(client, schemaName, "information_schema.tables");
    requireExpectedSet("Tables", tableNames, [...EXPECTED_TABLES]);

    const enumNames = await listObjects(client, schemaName, "pg_type");
    requireExpectedSet("Enums", enumNames, [...EXPECTED_ENUMS]);
    const billingLookupLabels = await listEnumLabels(client, schemaName, "billing_lookup_status");
    requireExpectedSet("billing_lookup_status labels", billingLookupLabels, [
      ...EXPECTED_BILLING_LOOKUP_LABELS,
    ]);

    const columnNames = await listObjects(client, schemaName, "information_schema.columns");
    requireExpectedSet("Columns", columnNames, expectedColumnRefs());

    for (const tableName of EXPECTED_TABLES) {
      await client.pool.query(
        `select count(*) from ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`,
      );
    }
  } finally {
    await closeDatabaseClient(client);
  }
}

async function main() {
  requireMembersOnBuiltIns();
  const env = serverRuntime();
  const schemaName = buildSchemaName();
  const localPostgresStatus = await readCanonicalLocalPostgresStatus({
    composeFilePath: new URL("./../compose.yaml", import.meta.url).pathname,
    connectionString: env.databaseUrl,
  });
  const localPostgresAdmission = describeCanonicalLocalPostgresPort(localPostgresStatus);
  if (!localPostgresAdmission.ok) {
    throw new Error(`${localPostgresAdmission.detail}; ${localPostgresAdmission.fix}`);
  }

  try {
    await createSchema(env.databaseUrl, schemaName);
    try {
      await runMigrationsForTarget(env.databaseUrl, schemaName);
      await verifyBootstrap(env.databaseUrl, schemaName);
    } finally {
      await dropSchema(env.databaseUrl, schemaName);
    }
  } catch (error) {
    if (isCanonicalLocalPostgresConnectionFailure(error)) {
      const status = await readCanonicalLocalPostgresStatus({
        composeFilePath: new URL("./../compose.yaml", import.meta.url).pathname,
        connectionString: env.databaseUrl,
      });
      throw new Error(
        formatCanonicalLocalPostgresBootstrapMessage({
          status,
          error,
        }),
      );
    }
    throw error;
  }

  process.stdout.write(`Bootstrap check passed for isolated schema ${schemaName}\n`);
}

await main();
