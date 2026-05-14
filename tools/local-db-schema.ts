import { BILLING_LOOKUP_STATUSES } from "@the-seven/contracts";
import { closeDatabaseClient, createDatabaseClient, type DatabaseClient } from "@the-seven/db";
import type { OperatorCheckResult } from "./local-postgres";

export const EXPECTED_TABLES = [
  "catalog_cache",
  "councils",
  "demo_magic_links",
  "demo_sessions",
  "jobs",
  "provider_calls",
  "rate_limit_buckets",
  "session_artifacts",
  "sessions",
  "users",
] as const;

export const EXPECTED_ENUMS = [
  "artifact_kind",
  "billing_lookup_status",
  "ingress_source",
  "job_state",
  "session_failure_kind",
  "session_status",
  "user_kind",
] as const;

export const EXPECTED_COLUMNS = {
  users: ["principal"],
  demo_sessions: ["revoked_at"],
  councils: ["definition_json"],
  sessions: ["snapshot_json", "trace_id", "status", "question_hash"],
  jobs: ["state", "credential_ciphertext", "lease_owner", "next_run_at"],
  provider_calls: [
    "request_max_output_tokens",
    "request_total_chars",
    "sent_reasoning_effort",
    "sent_provider_require_parameters",
    "sent_provider_ignored_providers_json",
    "billing_lookup_status",
    "total_cost_usd_micros",
    "error_status",
  ],
  catalog_cache: ["expiration_date", "max_completion_tokens"],
} as const;

export const EXPECTED_BILLING_LOOKUP_LABELS = [...BILLING_LOOKUP_STATUSES] as const;

export type LocalDatabaseSchemaState = Readonly<
  | {
      kind: "blank";
      missingTables: readonly string[];
      missingColumns: readonly string[];
    }
  | {
      kind: "current";
      missingTables: readonly string[];
      missingColumns: readonly string[];
    }
  | {
      kind: "drift";
      missingTables: readonly string[];
      missingColumns: readonly string[];
    }
>;

export function expectedColumnRefs(): string[] {
  return Object.entries(EXPECTED_COLUMNS).flatMap(([tableName, columns]) => {
    return columns.map((column) => `${tableName}.${column}`);
  });
}

export function describeLocalDatabaseSchemaObjects(input: {
  tableNames: readonly string[];
  columnRefs: readonly string[];
}): LocalDatabaseSchemaState {
  if (input.tableNames.length === 0) {
    return {
      kind: "blank",
      missingTables: [],
      missingColumns: [],
    };
  }

  const tableSet = new Set(input.tableNames);
  const columnSet = new Set(input.columnRefs);
  const missingTables = EXPECTED_TABLES.filter((tableName) => !tableSet.has(tableName));
  const missingColumns = expectedColumnRefs().filter((columnRef) => !columnSet.has(columnRef));

  if (missingTables.length === 0 && missingColumns.length === 0) {
    return {
      kind: "current",
      missingTables: [],
      missingColumns: [],
    };
  }

  return {
    kind: "drift",
    missingTables,
    missingColumns,
  };
}

async function listLiveSchemaObjects(client: DatabaseClient, schemaName: string) {
  const [tables, columns] = await Promise.all([
    client.pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = $1 order by table_name",
      [schemaName],
    ),
    client.pool.query<{ table_name: string; column_name: string }>(
      "select table_name, column_name from information_schema.columns where table_schema = $1 order by table_name, column_name",
      [schemaName],
    ),
  ]);

  return {
    tableNames: tables.rows.map((row) => row.table_name),
    columnRefs: columns.rows.map((row) => `${row.table_name}.${row.column_name}`),
  };
}

export async function readLocalDatabaseSchemaState(
  connectionString: string,
  schemaName = "public",
): Promise<LocalDatabaseSchemaState> {
  const client = createDatabaseClient({
    connectionString,
    schemaName: null,
    allowExitOnIdle: true,
    maxConnections: 1,
  });

  try {
    return describeLocalDatabaseSchemaObjects(await listLiveSchemaObjects(client, schemaName));
  } finally {
    await closeDatabaseClient(client);
  }
}

function formatMissingList(values: readonly string[]) {
  return values.length > 0 ? values.join(", ") : "none";
}

export function toLocalDatabaseSchemaCheck(state: LocalDatabaseSchemaState): OperatorCheckResult {
  if (state.kind === "blank") {
    return {
      label: "local postgres schema",
      ok: true,
      detail: "blank database; Node runtime will apply the squashed init SQL",
      fix: null,
    };
  }

  if (state.kind === "current") {
    return {
      label: "local postgres schema",
      ok: true,
      detail: "existing The Seven tables match the squashed launch schema",
      fix: null,
    };
  }

  return {
    label: "local postgres schema",
    ok: false,
    detail: `schema drift: missing tables ${formatMissingList(
      state.missingTables,
    )}; missing columns ${formatMissingList(state.missingColumns)}`,
    fix: "Run `pnpm local:db:reset`; this greenfield repo updates the squashed init SQL instead of migrating local volumes.",
  };
}
