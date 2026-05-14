import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  checkEnvFileMode,
  checkEnvFilePresence,
  checkEnvProfile,
  checkLegacyEnvRuntimeKeys,
} from "./env-doctor";

let tempDirectories: string[] = [];

function writeEnv(contents: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "seven-env-doctor-"));
  tempDirectories.push(directory);
  const filePath = path.join(directory, ".env.local");
  writeFileSync(filePath, contents, "utf8");
  return filePath;
}

function writeNamedEnv(fileName: string, contents: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "seven-env-doctor-"));
  tempDirectories.push(directory);
  const filePath = path.join(directory, fileName);
  writeFileSync(filePath, contents, "utf8");
  return filePath;
}

describe("env doctor profiles", () => {
  afterEach(() => {
    for (const directory of tempDirectories) {
      rmSync(directory, { force: true, recursive: true });
    }
    tempDirectories = [];
  });

  test("live doctor does not require a fixed SEVEN_BASE_URL in .env.local", () => {
    const envLocalPath =
      writeEnv(`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/the_seven
SEVEN_JOB_CREDENTIAL_SECRET=0123456789abcdef
SEVEN_PUBLIC_ORIGIN=https://theseven.ai
SEVEN_APP_NAME=The Seven
SEVEN_BYOK_KEY=sk-or-byok
SEVEN_DEMO_ENABLED=1
SEVEN_DEMO_OPENROUTER_KEY=sk-or-demo
SEVEN_DEMO_RESEND_API_KEY=re_live_resend_key
SEVEN_DEMO_EMAIL_FROM=demo@theseven.ai
SEVEN_DEMO_TEST_EMAIL=inbound@theseven.ai
`);

    const result = checkEnvProfile({ envLocalPath, live: true });

    expect(result.ok).toBe(true);
  });

  test("live doctor is additive over local readiness", () => {
    const envLocalPath =
      writeEnv(`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/the_seven
SEVEN_PUBLIC_ORIGIN=https://theseven.ai
SEVEN_APP_NAME=The Seven
SEVEN_BYOK_KEY=sk-or-byok
SEVEN_DEMO_ENABLED=1
SEVEN_DEMO_OPENROUTER_KEY=sk-or-demo
SEVEN_DEMO_RESEND_API_KEY=re_live_resend_key
SEVEN_DEMO_EMAIL_FROM=demo@theseven.ai
SEVEN_DEMO_TEST_EMAIL=inbound@theseven.ai
`);

    const result = checkEnvProfile({ envLocalPath, live: true });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("SEVEN_JOB_CREDENTIAL_SECRET");
  });

  test("reports missing .env.local and refuses legacy runtime keys", () => {
    const legacyPath = writeNamedEnv(
      ".env",
      "SEVEN_BYOK_KEY=sk-or\nSEVEN_PUBLIC_ORIGIN=http://localhost\n",
    );
    const envLocalPath = path.join(path.dirname(legacyPath), ".env.local");

    const presence = checkEnvFilePresence({ envLocalPath, envLegacyPath: legacyPath });
    const legacy = checkLegacyEnvRuntimeKeys(legacyPath);

    expect(presence.ok).toBe(false);
    expect(presence.detail).toBe(".env.local is missing; legacy .env is present");
    expect(legacy.ok).toBe(false);
    expect(legacy.detail).toContain("SEVEN_BYOK_KEY");
    expect(legacy.detail).toContain("SEVEN_PUBLIC_ORIGIN");
  });

  test("live profile rejects placeholder live credential values", () => {
    const envLocalPath =
      writeEnv(`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/the_seven
SEVEN_JOB_CREDENTIAL_SECRET=0123456789abcdef
SEVEN_PUBLIC_ORIGIN=https://theseven.ai
SEVEN_APP_NAME=The Seven
SEVEN_BYOK_KEY=replace-with-openrouter-byok-key
SEVEN_DEMO_ENABLED=1
SEVEN_DEMO_OPENROUTER_KEY=replace-with-openrouter-demo-key
SEVEN_DEMO_RESEND_API_KEY=replace-with-resend-api-key
SEVEN_DEMO_EMAIL_FROM=replace-with-demo-sender
SEVEN_DEMO_TEST_EMAIL=replace-with-demo-test-inbox
`);

    const result = checkEnvProfile({
      envLocalPath,
      live: true,
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("placeholder values");
    expect(result.detail).toContain("SEVEN_BYOK_KEY");
  });

  test("rejects secret slices broader than 0600", () => {
    const envLocalPath = writeEnv("SEVEN_APP_NAME=The Seven\n");
    chmodSync(envLocalPath, 0o644);

    const result = checkEnvFileMode(envLocalPath);

    expect(result.ok).toBe(false);
    expect(result.detail).toBe("mode 0644");
  });
});
