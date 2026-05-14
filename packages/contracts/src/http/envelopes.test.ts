import { describe, expect, test } from "vitest";
import { successEnvelopeSchema } from "./envelopes";
import { errorEnvelopeSchema } from "./errors";

const timestamp = "2026-05-12T10:00:00.000Z";

describe("HTTP envelope contracts", () => {
  test("rejects extra fields on success envelopes", () => {
    expect(() =>
      successEnvelopeSchema.parse({
        schema_version: 1,
        trace_id: "trace",
        ts: timestamp,
        result: {
          resource: "sessions.create",
          payload: { sessionId: 1 },
          extra: "accepted",
        },
      }),
    ).toThrow();

    expect(() =>
      successEnvelopeSchema.parse({
        schema_version: 1,
        trace_id: "trace",
        ts: timestamp,
        result: {
          resource: "sessions.create",
          payload: { sessionId: 1 },
        },
        extra: "accepted",
      }),
    ).toThrow();
  });

  test("rejects extra fields on error envelopes", () => {
    expect(() =>
      errorEnvelopeSchema.parse({
        schema_version: 1,
        trace_id: "trace",
        ts: timestamp,
        kind: "upstream_error",
        message: "OpenRouter request failed",
        details: {
          service: "openrouter",
        },
        status: 502,
      }),
    ).toThrow();
  });
});
