import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { checkEnvProfile } from "./env-doctor";

let tempDirectories: string[] = [];

function writeEnv(contents: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "seven-env-doctor-"));
  tempDirectories.push(directory);
  const filePath = path.join(directory, ".env.local");
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

  test("live doctor rejects an explicit invalid SEVEN_BASE_URL", () => {
    const envLocalPath =
      writeEnv(`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/the_seven
SEVEN_JOB_CREDENTIAL_SECRET=0123456789abcdef
SEVEN_PUBLIC_ORIGIN=https://theseven.ai
SEVEN_APP_NAME=The Seven
SEVEN_BASE_URL=not-a-url
SEVEN_BYOK_KEY=sk-or-byok
SEVEN_DEMO_ENABLED=1
SEVEN_DEMO_OPENROUTER_KEY=sk-or-demo
SEVEN_DEMO_RESEND_API_KEY=re_live_resend_key
SEVEN_DEMO_EMAIL_FROM=demo@theseven.ai
SEVEN_DEMO_TEST_EMAIL=inbound@theseven.ai
`);

    const result = checkEnvProfile({ envLocalPath, live: true });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("SEVEN_BASE_URL");
  });
});
