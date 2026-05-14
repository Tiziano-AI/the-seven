import { describe, expect, test } from "vitest";
import { buildLocalOperatorEnv } from "./local-operator-env";

describe("local operator env", () => {
  test("local preflight is insulated from ambient production NODE_ENV", () => {
    const env = buildLocalOperatorEnv({
      assignments: new Map([["NODE_ENV", "development"]]),
      env: { NODE_ENV: "production" },
    });

    expect(env.NODE_ENV).toBe("development");
  });

  test("local file assignments override ambient reserved runtime keys", () => {
    const env = buildLocalOperatorEnv({
      assignments: new Map([
        ["DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/the_seven"],
        ["SEVEN_PUBLIC_ORIGIN", "http://localhost"],
      ]),
      env: {
        DATABASE_URL: "postgresql://ambient:ambient@example.com:5432/ambient",
        NODE_ENV: "production",
        PATH: "/usr/bin",
        SEVEN_BASE_URL: "http://127.0.0.1:3000",
        SEVEN_NEXT_DIST_DIR: ".next-local/3000",
        SEVEN_PUBLIC_ORIGIN: "https://ambient.example",
      },
    });

    expect(env.DATABASE_URL).toBe("postgresql://postgres:postgres@127.0.0.1:5432/the_seven");
    expect(env.SEVEN_PUBLIC_ORIGIN).toBe("http://localhost");
    expect(env.SEVEN_BASE_URL).toBeUndefined();
    expect(env.SEVEN_NEXT_DIST_DIR).toBeUndefined();
    expect(env.PATH).toBe("/usr/bin");
  });
});
