import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  describeLocalDatabaseSchemaObjects,
  EXPECTED_BILLING_LOOKUP_LABELS,
  EXPECTED_ENUMS,
  EXPECTED_TABLES,
  expectedColumnRefs,
  toLocalDatabaseSchemaCheck,
} from "./local-db-schema";

const currentTables = [...EXPECTED_TABLES] as const;
const currentColumns = expectedColumnRefs();
const currentEnums = [...EXPECTED_ENUMS] as const;
const currentEnumLabels = { billing_lookup_status: [...EXPECTED_BILLING_LOOKUP_LABELS] } as const;

function squashedInitColumnRefs(): string[] {
  const sql = readFileSync(
    new URL("../packages/db/drizzle/0000_init.sql", import.meta.url),
    "utf8",
  );
  const refs: string[] = [];
  const tableBlocks = sql.matchAll(/CREATE TABLE IF NOT EXISTS "([^"]+)" \(([\s\S]*?)\n\);/gu);
  for (const match of tableBlocks) {
    const tableName = match[1];
    const block = match[2];
    if (!tableName || !block) {
      throw new Error("Could not parse squashed init table block.");
    }
    for (const line of block.split("\n")) {
      const columnMatch = /^\s+"([^"]+)"/u.exec(line);
      const columnName = columnMatch?.[1];
      if (columnName) {
        refs.push(`${tableName}.${columnName}`);
      }
    }
  }
  return refs.sort((left, right) => left.localeCompare(right));
}

describe("local database schema drift guard", () => {
  test("tracks every column in the squashed launch SQL", () => {
    expect(expectedColumnRefs().sort((left, right) => left.localeCompare(right))).toEqual(
      squashedInitColumnRefs(),
    );
  });

  test("accepts a blank compose database because node boot applies the squashed init SQL", () => {
    const state = describeLocalDatabaseSchemaObjects({
      tableNames: [],
      columnRefs: [],
      enumNames: [],
      enumLabels: {},
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
      enumNames: currentEnums,
      enumLabels: currentEnumLabels,
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
      enumNames: currentEnums,
      enumLabels: currentEnumLabels,
    });

    const check = toLocalDatabaseSchemaCheck(state);
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("provider_calls.sent_reasoning_effort");
    expect(check.fix).toContain("pnpm local:db:reset");
  });

  test("fails stale local volumes that predate billing lookup enum labels", () => {
    const state = describeLocalDatabaseSchemaObjects({
      tableNames: currentTables,
      columnRefs: currentColumns,
      enumNames: currentEnums,
      enumLabels: { billing_lookup_status: ["not_requested", "pending", "succeeded"] },
    });

    const check = toLocalDatabaseSchemaCheck(state);
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("billing_lookup_status.failed");
    expect(check.fix).toContain("pnpm local:db:reset");
  });

  test("fails stale local volumes missing launch enums", () => {
    const state = describeLocalDatabaseSchemaObjects({
      tableNames: currentTables,
      columnRefs: currentColumns,
      enumNames: currentEnums.filter((enumName) => enumName !== "billing_lookup_status"),
      enumLabels: currentEnumLabels,
    });

    const check = toLocalDatabaseSchemaCheck(state);
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("billing_lookup_status");
    expect(check.fix).toContain("pnpm local:db:reset");
  });
});
