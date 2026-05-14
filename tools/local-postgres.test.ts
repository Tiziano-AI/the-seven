import { describe, expect, test } from "vitest";
import {
  type CanonicalLocalPostgresStatus,
  describeCanonicalLocalPostgresPort,
  formatCanonicalLocalPostgresBootstrapMessage,
  formatCanonicalLocalPostgresUnavailableMessage,
  isCanonicalLocalPostgresConnectionFailure,
  toCanonicalLocalPostgresCheck,
} from "./local-postgres";

function buildStatus(
  overrides: Partial<CanonicalLocalPostgresStatus> = {},
): CanonicalLocalPostgresStatus {
  return {
    target: {
      host: "127.0.0.1",
      port: "5432",
      database: "the_seven",
    },
    composeHealth: "missing",
    portOwner: null,
    ...overrides,
  };
}

describe("local postgres diagnostics", () => {
  test("passes when the compose container owns the canonical port", () => {
    const detail = describeCanonicalLocalPostgresPort(
      buildStatus({
        composeHealth: "healthy",
        portOwner: { kind: "docker", name: "the-seven-postgres" },
      }),
    );

    expect(detail).toEqual({
      ok: true,
      detail: "the-seven-postgres owns 127.0.0.1:5432",
      fix: null,
    });
  });

  test("fails noncanonical database targets without exposing credentials", () => {
    const detail = describeCanonicalLocalPostgresPort(
      buildStatus({
        target: {
          host: "db.internal",
          port: "6543",
          database: "the_seven",
        },
      }),
    );

    expect(detail).toEqual({
      ok: false,
      detail:
        "DATABASE_URL points to db.internal:6543/the_seven, not canonical local Postgres 127.0.0.1:5432/the_seven",
      fix: "Point DATABASE_URL at the compose-managed local Postgres target from `.env.local.example`.",
    });
  });

  test("formats noncanonical database targets as local command failures", () => {
    const message = formatCanonicalLocalPostgresUnavailableMessage(
      buildStatus({
        target: {
          host: "db.internal",
          port: "6543",
          database: "the_seven",
        },
      }),
    );

    expect(message).toContain("db.internal:6543/the_seven");
    expect(message).not.toContain("postgresql://");
    expect(message).toContain(".env.local.example");
  });

  test("fails clearly when another docker container owns the canonical port", () => {
    const check = toCanonicalLocalPostgresCheck(
      buildStatus({
        portOwner: { kind: "docker", name: "agents-postgres-1" },
      }),
    );

    expect(check.ok).toBe(false);
    expect(check.detail).toContain("agents-postgres-1");
    expect(check.fix).toContain("the-seven-postgres");
  });

  test("fails clearly when another process owns the canonical port", () => {
    const message = formatCanonicalLocalPostgresUnavailableMessage(
      buildStatus({
        portOwner: { kind: "process", summary: "Postgres.app (pid 100)" },
      }),
    );

    expect(message).toContain("Postgres.app (pid 100)");
    expect(message).toContain("the-seven-postgres");
  });

  test("explains bootstrap database-missing errors through the port owner", () => {
    const message = formatCanonicalLocalPostgresBootstrapMessage({
      status: buildStatus({
        portOwner: { kind: "docker", name: "agents-postgres-1" },
      }),
      error: { code: "3D000" },
    });

    expect(message).toContain("agents-postgres-1");
    expect(message).toContain("the-seven-postgres");
  });

  test("explains database-missing errors on healthy local Postgres as reset work", () => {
    const message = formatCanonicalLocalPostgresBootstrapMessage({
      status: buildStatus({
        composeHealth: "healthy",
        portOwner: { kind: "docker", name: "the-seven-postgres" },
      }),
      error: { code: "3D000" },
    });

    expect(message).toContain("Database the_seven does not exist");
    expect(message).toContain("pnpm local:db:reset");
  });

  test("explains database-missing errors without an active owner as local db startup work", () => {
    const message = formatCanonicalLocalPostgresBootstrapMessage({
      status: buildStatus({
        composeHealth: "missing",
        portOwner: null,
      }),
      error: { code: "3D000" },
    });

    expect(message).toContain("is not the active Postgres owner");
    expect(message).toContain("pnpm local:db:up");
  });

  test("recognizes connection and database-missing failures", () => {
    expect(isCanonicalLocalPostgresConnectionFailure({ code: "ECONNREFUSED" })).toBe(true);
    expect(isCanonicalLocalPostgresConnectionFailure({ code: "3D000" })).toBe(true);
    expect(isCanonicalLocalPostgresConnectionFailure(new Error("other failure"))).toBe(false);
  });
});
