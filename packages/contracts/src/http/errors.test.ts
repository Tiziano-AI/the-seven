import { describe, expect, test } from "vitest";
import {
  errorEnvelopeSchema,
  invalidInputDetails,
  invalidInputDetailsSchema,
  upstreamErrorDetails,
  upstreamErrorDetailsSchema,
} from "./errors";

const timestamp = "2026-05-12T10:00:00.000Z";

describe("HTTP error contracts", () => {
  test("requires reasoned invalid_input details", () => {
    expect(
      invalidInputDetails({
        reason: "invalid_json",
        issues: [{ path: "", message: "Request body must be valid JSON" }],
      }),
    ).toEqual({
      reason: "invalid_json",
      issues: [{ path: "", message: "Request body must be valid JSON" }],
    });

    expect(() =>
      invalidInputDetailsSchema.parse({
        issues: [{ path: "", message: "Request body must be valid JSON" }],
      }),
    ).toThrow();
  });

  test("keeps upstream_error details service-only", () => {
    expect(upstreamErrorDetails({ service: "openrouter" })).toEqual({ service: "openrouter" });

    expect(() =>
      upstreamErrorDetailsSchema.parse({
        service: "openrouter",
        status: 429,
      }),
    ).toThrow();

    expect(() =>
      errorEnvelopeSchema.parse({
        schema_version: 1,
        trace_id: "trace",
        ts: timestamp,
        kind: "upstream_error",
        message: "OpenRouter request failed",
        details: {
          service: "openrouter",
          status: 429,
        },
      }),
    ).toThrow();
  });
});
