import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { OpenRouterRequestFailedError } from "../adapters/openrouter";
import { ResendRequestFailedError } from "../adapters/resend";
import { mapProviderErrorToEdgeError } from "./errors";

describe("mapProviderErrorToEdgeError", () => {
  test("maps OpenRouter failures to upstream_error", () => {
    const mapped = mapProviderErrorToEdgeError(
      new OpenRouterRequestFailedError({
        status: 429,
        message: "OpenRouter request failed (status 429): slow down",
      }),
    );

    expect(mapped?.kind).toBe("upstream_error");
    expect(mapped?.message).toBe("OpenRouter request failed");
    expect(mapped?.status).toBe(502);
    expect(mapped?.details).toEqual({ service: "openrouter" });
  });

  test("maps Resend failures to upstream_error", () => {
    const mapped = mapProviderErrorToEdgeError(
      new ResendRequestFailedError({
        status: 502,
        message: "Resend request failed (status 502): upstream",
      }),
    );

    expect(mapped?.kind).toBe("upstream_error");
    expect(mapped?.message).toBe("Resend request failed");
    expect(mapped?.status).toBe(502);
    expect(mapped?.details).toEqual({ service: "resend" });
  });

  test("does not expose raw upstream messages or configured secrets", () => {
    const previous = process.env.SEVEN_DEMO_RESEND_API_KEY;
    process.env.SEVEN_DEMO_RESEND_API_KEY = "re_secret_resend_key_abcdefghijklmnopqrstuvwxyz";
    try {
      const mapped = mapProviderErrorToEdgeError(
        new ResendRequestFailedError({
          status: 500,
          message:
            "Resend request failed (status 500): re_secret_resend_key_abcdefghijklmnopqrstuvwxyz",
        }),
      );

      expect(mapped?.message).toBe("Resend request failed");
      expect(mapped?.message).not.toContain("500");
      expect(mapped?.message).not.toContain("re_secret_resend_key_abcdefghijklmnopqrstuvwxyz");
    } finally {
      if (previous === undefined) {
        delete process.env.SEVEN_DEMO_RESEND_API_KEY;
      } else {
        process.env.SEVEN_DEMO_RESEND_API_KEY = previous;
      }
    }
  });
});
