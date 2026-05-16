import { describe, expect, test } from "vitest";
import { requireTraceHeaderMatchesEnvelope, traceHeaderMismatchMessage } from "./trace";

describe("JSON API trace contract", () => {
  test("accepts matching trace header and envelope ids", () => {
    expect(
      traceHeaderMismatchMessage({
        traceHeader: "trace-1",
        envelopeTraceId: "trace-1",
        context: "public smoke",
      }),
    ).toBeNull();
  });

  test("rejects missing or mismatched trace headers", () => {
    expect(() =>
      requireTraceHeaderMatchesEnvelope({
        traceHeader: null,
        envelopeTraceId: "trace-1",
        context: "public smoke",
      }),
    ).toThrow("public smoke trace header does not match envelope trace_id");
    expect(() =>
      requireTraceHeaderMatchesEnvelope({
        traceHeader: "wrong",
        envelopeTraceId: "trace-1",
        context: "public smoke",
      }),
    ).toThrow("public smoke trace header does not match envelope trace_id");
  });
});
