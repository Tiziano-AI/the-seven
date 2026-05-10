import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@the-seven/config", () => ({
  serverRuntime: () => ({
    jobCredentialSecret: "local-test-secret-with-enough-entropy",
  }),
}));

import { decryptJobCredential, encryptJobCredential } from "./jobCredential";

describe("job credential envelope", () => {
  test("round-trips with context-bound AAD", () => {
    const context = { sessionId: 12, jobId: 34 };
    const encrypted = encryptJobCredential("sk-or-secret", context);

    expect(encrypted.startsWith("v2.local.")).toBe(true);
    expect(decryptJobCredential(encrypted, context)).toBe("sk-or-secret");
  });

  test("rejects decrypt with a different session or job context", () => {
    const encrypted = encryptJobCredential("sk-or-secret", { sessionId: 12, jobId: 34 });

    expect(() => decryptJobCredential(encrypted, { sessionId: 12, jobId: 35 })).toThrow();
    expect(() => decryptJobCredential(encrypted, { sessionId: 13, jobId: 34 })).toThrow();
  });
});
