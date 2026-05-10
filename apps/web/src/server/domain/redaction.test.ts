import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { redactErrorMessage, redactRateLimitScope, redactText } from "./redaction";

describe("redaction", () => {
  test("redacts provider and demo credentials", () => {
    expect(redactText("Bearer sk-or-secret-token-abcdefghijklmnopqrstuvwxyz123456")).toBe(
      "[redacted]",
    );
    expect(redactText("Demo demo-token-abcdefghijklmnopqrstuvwxyz123456")).toBe("[redacted]");
  });

  test("redacts only the sensitive limiter scope segment", () => {
    expect(redactRateLimitScope("demo:email:user@example.com")).toBe("demo:email:[redacted]");
    expect(redactRateLimitScope("demo:global")).toBe("demo:global");
  });

  test("maps unknown thrown values to the fallback", () => {
    expect(redactErrorMessage("not an error", "fallback")).toBe("fallback");
  });
});
