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

    expect(mapped).toMatchObject({
      kind: "upstream_error",
      status: 429,
      details: {
        service: "openrouter",
        status: 429,
      },
    });
  });

  test("maps Resend failures to upstream_error", () => {
    const mapped = mapProviderErrorToEdgeError(
      new ResendRequestFailedError({
        status: 502,
        message: "Resend request failed (status 502): upstream",
      }),
    );

    expect(mapped).toMatchObject({
      kind: "upstream_error",
      status: 502,
      details: {
        service: "resend",
        status: 502,
      },
    });
  });
});
