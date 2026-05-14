import { describe, expect, test } from "vitest";
import {
  cliRuntime,
  LIVE_PROOF_REQUIRED_KEYS,
  liveProof,
  operatorDoctor,
  parsePublicOrigin,
  serverRuntime,
} from "./env";

const baseServerEnv = {
  NODE_ENV: "development",
  PORT: "0",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/the_seven",
  SEVEN_JOB_CREDENTIAL_SECRET: "0123456789abcdef",
  SEVEN_PUBLIC_ORIGIN: "http://localhost",
  SEVEN_APP_NAME: "The Seven",
  SEVEN_DEMO_ENABLED: "0",
} as const;

const liveEnv = {
  ...baseServerEnv,
  SEVEN_PUBLIC_ORIGIN: "https://theseven.ai",
  SEVEN_BYOK_KEY: "sk-or-byok",
  SEVEN_DEMO_ENABLED: "1",
  SEVEN_DEMO_OPENROUTER_KEY: "sk-or-demo",
  SEVEN_DEMO_RESEND_API_KEY: "re_demo",
  SEVEN_DEMO_EMAIL_FROM: "demo@theseven.ai",
  SEVEN_DEMO_TEST_EMAIL: "inbox@theseven.ai",
} as const;

describe("env materialization", () => {
  test("normalizes public origin to a bare origin", () => {
    const env = serverRuntime({
      ...baseServerEnv,
      SEVEN_PUBLIC_ORIGIN: "https://theseven.ai/",
    });

    expect(env.publicOrigin).toBe("https://theseven.ai");
  });

  test("rejects public origins with paths or query strings", () => {
    const invalidOrigins = [
      "https://theseven.ai/app?x=1",
      "https://theseven.ai//",
      "https://theseven.ai#/",
      "https://theseven.ai/#/",
    ];
    for (const origin of invalidOrigins) {
      expect(() =>
        serverRuntime({
          ...baseServerEnv,
          SEVEN_PUBLIC_ORIGIN: origin,
        }),
      ).toThrow("SEVEN_PUBLIC_ORIGIN must be a bare origin");
    }
  });

  test("rejects public origins with credentials or non-HTTP schemes", () => {
    expect(() => parsePublicOrigin("https://user:pass@theseven.ai")).toThrow(
      "SEVEN_PUBLIC_ORIGIN must not include credentials",
    );
    expect(() => parsePublicOrigin("ftp://theseven.ai")).toThrow(
      "SEVEN_PUBLIC_ORIGIN must use http:// or https://",
    );
  });

  test("rejects loopback public origins in production", () => {
    expect(() =>
      serverRuntime({
        ...baseServerEnv,
        NODE_ENV: "production",
        SEVEN_PUBLIC_ORIGIN: "http://localhost",
      }),
    ).toThrow("Production SEVEN_PUBLIC_ORIGIN must be HTTPS and non-loopback");
  });

  test("rejects IPv6 loopback public origins in production", () => {
    expect(() =>
      serverRuntime({
        ...baseServerEnv,
        NODE_ENV: "production",
        SEVEN_PUBLIC_ORIGIN: "https://[::1]",
      }),
    ).toThrow("Production SEVEN_PUBLIC_ORIGIN must be HTTPS and non-loopback");
  });

  test("requires SEVEN_PUBLIC_ORIGIN in the live proof profile", () => {
    expect(LIVE_PROOF_REQUIRED_KEYS).toContain("SEVEN_PUBLIC_ORIGIN");
    expect(() =>
      liveProof({
        ...liveEnv,
        SEVEN_PUBLIC_ORIGIN: "",
      }),
    ).toThrow();
  });

  test("requires explicit local transport URL for cli only", () => {
    expect(() =>
      cliRuntime({
        NODE_ENV: "test",
        SEVEN_BYOK_KEY: "sk-or",
      }),
    ).toThrow();
  });

  test("does not treat SEVEN_BASE_URL as a live credential", () => {
    expect(liveProof(liveEnv).byokKey).toBe("sk-or-byok");
    expect(() =>
      liveProof({
        ...liveEnv,
        SEVEN_BASE_URL: "",
      }),
    ).not.toThrow();
  });

  test("server runtime requires an explicit public origin from config or launch projection", () => {
    const { SEVEN_PUBLIC_ORIGIN: _unused, ...missingPublicOrigin } = baseServerEnv;

    expect(() => serverRuntime(missingPublicOrigin)).toThrow();
  });

  test("materializes live proof and operator profiles with the same public origin rule", () => {
    expect(liveProof(liveEnv).publicOrigin).toBe("https://theseven.ai");
    expect(operatorDoctor(liveEnv).publicOrigin).toBe("https://theseven.ai");
  });
});
