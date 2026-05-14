import { describe, expect, test } from "vitest";
import { describeLocalDatabaseSchemaObjects, toLocalDatabaseSchemaCheck } from "./local-db-schema";

const currentTables = [
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

const currentColumns = [
  "catalog_cache.expiration_date",
  "catalog_cache.max_completion_tokens",
  "councils.definition_json",
  "demo_sessions.revoked_at",
  "jobs.credential_ciphertext",
  "jobs.lease_owner",
  "jobs.next_run_at",
  "jobs.state",
  "provider_calls.billing_lookup_status",
  "provider_calls.error_status",
  "provider_calls.request_max_output_tokens",
  "provider_calls.request_total_chars",
  "provider_calls.sent_provider_ignored_providers_json",
  "provider_calls.sent_provider_require_parameters",
  "provider_calls.sent_reasoning_effort",
  "provider_calls.total_cost_usd_micros",
  "sessions.question_hash",
  "sessions.snapshot_json",
  "sessions.status",
  "sessions.trace_id",
  "users.principal",
] as const;

describe("local database schema drift guard", () => {
  test("accepts a blank compose database because node boot applies the squashed init SQL", () => {
    const state = describeLocalDatabaseSchemaObjects({
      tableNames: [],
      columnRefs: [],
    });

    expect(toLocalDatabaseSchemaCheck(state)).toEqual({
      label: "local postgres schema",
      ok: true,
      detail: "blank database; Node runtime will apply the squashed init SQL",
      fix: null,
    });
  });

  test("accepts an existing database that matches the squashed launch schema", () => {
    const state = describeLocalDatabaseSchemaObjects({
      tableNames: currentTables,
      columnRefs: currentColumns,
    });

    expect(toLocalDatabaseSchemaCheck(state)).toEqual({
      label: "local postgres schema",
      ok: true,
      detail: "existing The Seven tables match the squashed launch schema",
      fix: null,
    });
  });

  test("fails stale local volumes that predate provider reasoning diagnostics", () => {
    const state = describeLocalDatabaseSchemaObjects({
      tableNames: currentTables,
      columnRefs: currentColumns.filter(
        (column) => column !== "provider_calls.sent_reasoning_effort",
      ),
    });

    const check = toLocalDatabaseSchemaCheck(state);
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("provider_calls.sent_reasoning_effort");
    expect(check.fix).toContain("pnpm local:db:reset");
  });
});
