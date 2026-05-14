import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  redactErrorDetails,
  redactErrorMessage,
  redactRateLimitScope,
  redactText,
} from "./redaction";

describe("redaction", () => {
  test("redacts provider bearer credentials", () => {
    expect(redactText("Bearer sk-or-secret-token-abcdefghijklmnopqrstuvwxyz123456")).toBe(
      "[redacted]",
    );
  });

  test("keeps long non-secret identifiers visible", () => {
    expect(redactText("generation_abcdefghijklmnopqrstuvwxyz1234567890")).toBe(
      "generation_abcdefghijklmnopqrstuvwxyz1234567890",
    );
  });

  test("redacts exact configured provider secrets without broad long-string matching", () => {
    const previous = process.env.SEVEN_DEMO_RESEND_API_KEY;
    process.env.SEVEN_DEMO_RESEND_API_KEY = "re_secret_resend_key_abcdefghijklmnopqrstuvwxyz";
    try {
      expect(redactText("provider echoed re_secret_resend_key_abcdefghijklmnopqrstuvwxyz")).toBe(
        "provider echoed [redacted]",
      );
      expect(redactText("generation_abcdefghijklmnopqrstuvwxyz1234567890")).toBe(
        "generation_abcdefghijklmnopqrstuvwxyz1234567890",
      );
    } finally {
      if (previous === undefined) {
        delete process.env.SEVEN_DEMO_RESEND_API_KEY;
      } else {
        process.env.SEVEN_DEMO_RESEND_API_KEY = previous;
      }
    }
  });

  test("redacts only the sensitive limiter scope segment", () => {
    expect(redactRateLimitScope("demo:email:user@example.com")).toBe("demo:email:[redacted]");
    expect(redactRateLimitScope("demo:consume:ip:::1")).toBe("demo:consume:ip:[redacted]");
    expect(redactRateLimitScope("demo:global")).toBe("demo:global");
  });

  test("redacts fallback messages for unknown thrown values", () => {
    expect(
      redactErrorMessage(
        "not an error",
        "fallback Bearer sk-or-secret-token-abcdefghijklmnopqrstuvwxyz123456",
      ),
    ).toBe("fallback [redacted]");
  });

  test("redacts credential-like material from public error details", () => {
    expect(
      redactErrorDetails({
        reason: "invalid_request",
        issues: [
          {
            path: "body.attachments.sk-or-secret-token-abcdefghijklmnopqrstuvwxyz123456",
            message: "Bad filename Bearer sk-or-secret-token-abcdefghijklmnopqrstuvwxyz123456",
          },
        ],
      }),
    ).toEqual({
      reason: "invalid_request",
      issues: [
        {
          path: "body.attachments.[redacted]",
          message: "Bad filename [redacted]",
        },
      ],
    });

    expect(
      redactErrorDetails({
        scope: "demo:email:sk-or-secret-token-abcdefghijklmnopqrstuvwxyz123456",
        limit: 1,
        windowSeconds: 60,
        resetAt: "2026-05-12T08:00:00.000Z",
      }),
    ).toMatchObject({ scope: "demo:email:[redacted]" });
  });
});
