import { describe, expect, test } from "vitest";
import {
  buildLocalPostgresComposeEnv,
  type CanonicalLocalPostgresStatus,
  DEFAULT_LOCAL_POSTGRES_PORT,
  describeCanonicalLocalPostgresPort,
  formatCanonicalLocalPostgresBootstrapMessage,
  formatCanonicalLocalPostgresUnavailableMessage,
  isCanonicalLocalPostgresConnectionFailure,
  isCanonicalLocalPostgresReady,
  toCanonicalLocalPostgresCheck,
} from "./local-postgres";

function buildStatus(
  overrides: Partial<CanonicalLocalPostgresStatus> = {},
): CanonicalLocalPostgresStatus {
  return {
    target: {
      host: "127.0.0.1",
      port: DEFAULT_LOCAL_POSTGRES_PORT,
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
      detail: "the-seven-postgres owns 127.0.0.1:55432",
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
        "DATABASE_URL points to db.internal:6543/the_seven, not supported local compose Postgres 127.0.0.1:55432/the_seven",
      fix: "Point DATABASE_URL at `.env.local.example` or another free 127.0.0.1 port for the the_seven database.",
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
    expect(check.fix).toContain("Change DATABASE_URL");
    expect(check.fix).not.toContain("Stop");
  });

  test("fails clearly when another process owns the canonical port", () => {
    const message = formatCanonicalLocalPostgresUnavailableMessage(
      buildStatus({
        portOwner: { kind: "process", summary: "Postgres.app (pid 100)" },
      }),
    );

    expect(message).toContain("Postgres.app (pid 100)");
    expect(message).toContain("Change DATABASE_URL");
    expect(message).not.toContain("Stop");
  });

  test("explains bootstrap database-missing errors through the port owner", () => {
    const message = formatCanonicalLocalPostgresBootstrapMessage({
      status: buildStatus({
        portOwner: { kind: "docker", name: "agents-postgres-1" },
      }),
      error: { code: "3D000" },
    });

    expect(message).toContain("agents-postgres-1");
    expect(message).toContain("Change DATABASE_URL");
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

    expect(message).toContain("is not healthy on configured local target");
    expect(message).toContain("pnpm local:db:up");
  });

  test("recognizes connection and database-missing failures", () => {
    expect(isCanonicalLocalPostgresConnectionFailure({ code: "ECONNREFUSED" })).toBe(true);
    expect(isCanonicalLocalPostgresConnectionFailure({ code: "3D000" })).toBe(true);
    expect(isCanonicalLocalPostgresConnectionFailure(new Error("other failure"))).toBe(false);
  });

  test("requires the compose container to own the configured port before ready claims", () => {
    expect(
      isCanonicalLocalPostgresReady(
        buildStatus({
          composeHealth: "healthy",
          portOwner: { kind: "docker", name: "the-seven-postgres" },
        }),
      ),
    ).toBe(true);
    expect(
      isCanonicalLocalPostgresReady(
        buildStatus({
          composeHealth: "healthy",
          portOwner: null,
        }),
      ),
    ).toBe(false);
  });

  test("projects the configured DATABASE_URL port into Docker Compose", () => {
    const env = buildLocalPostgresComposeEnv({
      connectionString: "postgresql://postgres:postgres@127.0.0.1:56543/the_seven",
      env: { NODE_ENV: "development", PATH: "/usr/bin" },
    });

    expect(env.SEVEN_LOCAL_POSTGRES_HOST).toBe("127.0.0.1");
    expect(env.SEVEN_LOCAL_POSTGRES_PORT).toBe("56543");
    expect(env.PATH).toBe("/usr/bin");
  });
});
