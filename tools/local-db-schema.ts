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
  catalog_cache: [
    "id",
    "model_id",
    "model_name",
    "description",
    "context_length",
    "max_completion_tokens",
    "expiration_date",
    "supported_parameters_json",
    "input_modalities_json",
    "output_modalities_json",
    "pricing_json",
    "refreshed_at",
    "created_at",
    "updated_at",
  ],
  rate_limit_buckets: [
    "id",
    "scope",
    "window_start",
    "window_seconds",
    "count",
    "created_at",
    "updated_at",
  ],
  users: ["id", "kind", "principal", "created_at", "updated_at"],
  demo_magic_links: [
    "id",
    "user_id",
    "token_hash",
    "requested_ip",
    "consumed_ip",
    "expires_at",
    "used_at",
    "created_at",
  ],
  demo_sessions: [
    "id",
    "user_id",
    "token_hash",
    "expires_at",
    "last_used_at",
    "revoked_at",
    "created_at",
  ],
  councils: ["id", "user_id", "name", "definition_json", "created_at", "updated_at"],
  sessions: [
    "id",
    "user_id",
    "query",
    "attachments_json",
    "snapshot_json",
    "council_name_at_run",
    "question_hash",
    "ingress_source",
    "ingress_version",
    "trace_id",
    "status",
    "failure_kind",
    "total_tokens",
    "total_cost_usd_micros",
    "total_cost_is_partial",
    "created_at",
    "updated_at",
  ],
  session_artifacts: [
    "id",
    "session_id",
    "phase",
    "artifact_kind",
    "member_position",
    "model_id",
    "content",
    "tokens_used",
    "cost_usd_micros",
    "created_at",
  ],
  provider_calls: [
    "id",
    "session_id",
    "phase",
    "member_position",
    "request_model_id",
    "request_max_output_tokens",
    "request_system_chars",
    "request_user_chars",
    "request_total_chars",
    "catalog_refreshed_at",
    "supported_parameters_json",
    "sent_parameters_json",
    "sent_reasoning_effort",
    "sent_provider_require_parameters",
    "sent_provider_ignored_providers_json",
    "denied_parameters_json",
    "request_started_at",
    "response_completed_at",
    "latency_ms",
    "response_id",
    "response_model",
    "billed_model_id",
    "total_cost_usd_micros",
    "usage_prompt_tokens",
    "usage_completion_tokens",
    "usage_total_tokens",
    "finish_reason",
    "native_finish_reason",
    "error_message",
    "choice_error_message",
    "choice_error_code",
    "error_status",
    "error_code",
    "billing_lookup_status",
    "created_at",
  ],
  jobs: [
    "id",
    "session_id",
    "state",
    "attempt_count",
    "credential_ciphertext",
    "lease_owner",
    "lease_expires_at",
    "next_run_at",
    "last_error",
    "created_at",
    "updated_at",
  ],
} as const;

export const EXPECTED_BILLING_LOOKUP_LABELS = [...BILLING_LOOKUP_STATUSES] as const;

export type LocalDatabaseSchemaState = Readonly<
  | {
      kind: "blank";
      missingTables: readonly string[];
      missingColumns: readonly string[];
      missingEnums: readonly string[];
      missingEnumLabels: readonly string[];
    }
  | {
      kind: "current";
      missingTables: readonly string[];
      missingColumns: readonly string[];
      missingEnums: readonly string[];
      missingEnumLabels: readonly string[];
    }
  | {
      kind: "drift";
      missingTables: readonly string[];
      missingColumns: readonly string[];
      missingEnums: readonly string[];
      missingEnumLabels: readonly string[];
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
  enumNames?: readonly string[];
  enumLabels?: Readonly<Record<string, readonly string[]>>;
}): LocalDatabaseSchemaState {
  if (input.tableNames.length === 0) {
    return {
      kind: "blank",
      missingTables: [],
      missingColumns: [],
      missingEnums: [],
      missingEnumLabels: [],
    };
  }

  const tableSet = new Set(input.tableNames);
  const columnSet = new Set(input.columnRefs);
  const enumSet = new Set(input.enumNames ?? []);
  const billingLookupLabelSet = new Set(input.enumLabels?.billing_lookup_status ?? []);
  const missingTables = EXPECTED_TABLES.filter((tableName) => !tableSet.has(tableName));
  const missingColumns = expectedColumnRefs().filter((columnRef) => !columnSet.has(columnRef));
  const missingEnums = EXPECTED_ENUMS.filter((enumName) => !enumSet.has(enumName));
  const missingEnumLabels = EXPECTED_BILLING_LOOKUP_LABELS.filter(
    (label) => !billingLookupLabelSet.has(label),
  ).map((label) => `billing_lookup_status.${label}`);

  if (
    missingTables.length === 0 &&
    missingColumns.length === 0 &&
    missingEnums.length === 0 &&
    missingEnumLabels.length === 0
  ) {
    return {
      kind: "current",
      missingTables: [],
      missingColumns: [],
      missingEnums: [],
      missingEnumLabels: [],
    };
  }

  return {
    kind: "drift",
    missingTables,
    missingColumns,
    missingEnums,
    missingEnumLabels,
  };
}

async function listLiveSchemaObjects(client: DatabaseClient, schemaName: string) {
  const [tables, columns, enums, billingLookupLabels] = await Promise.all([
    client.pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = $1 order by table_name",
      [schemaName],
    ),
    client.pool.query<{ table_name: string; column_name: string }>(
      "select table_name, column_name from information_schema.columns where table_schema = $1 order by table_name, column_name",
      [schemaName],
    ),
    client.pool.query<{ typname: string }>(
      `select t.typname
         from pg_type t
         join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = $1
          and t.typtype = 'e'
        order by t.typname`,
      [schemaName],
    ),
    client.pool.query<{ enumlabel: string }>(
      `select e.enumlabel
         from pg_enum e
         join pg_type t on t.oid = e.enumtypid
         join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = $1
          and t.typname = 'billing_lookup_status'
        order by e.enumsortorder`,
      [schemaName],
    ),
  ]);

  return {
    tableNames: tables.rows.map((row) => row.table_name),
    columnRefs: columns.rows.map((row) => `${row.table_name}.${row.column_name}`),
    enumNames: enums.rows.map((row) => row.typname),
    enumLabels: {
      billing_lookup_status: billingLookupLabels.rows.map((row) => row.enumlabel),
    },
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
    )}; missing columns ${formatMissingList(state.missingColumns)}; missing enums ${formatMissingList(
      state.missingEnums,
    )}; missing enum labels ${formatMissingList(state.missingEnumLabels)}`,
    fix: "Run `pnpm local:db:reset`; this greenfield repo updates the squashed init SQL instead of migrating local volumes.",
  };
}
