import { describe, expect, test } from "vitest";
import { formatCostEvidence, formatFailureKind } from "./session-inspector-formatters";

describe("formatFailureKind", () => {
  test("maps run failure enums to operator-facing recovery copy", () => {
    expect(formatFailureKind("server_restart")).toBe("Interrupted after server restart");
    expect(formatFailureKind("invalid_run_spec")).toBe("Run specification needs repair");
    expect(formatFailureKind("phase1_inference_failed")).toBe("Draft phase failed");
    expect(formatFailureKind("phase2_inference_failed")).toBe("Critique phase failed");
    expect(formatFailureKind("phase3_inference_failed")).toBe("Verdict phase failed");
    expect(formatFailureKind("concurrent_execution")).toBe("Another worker already owns this run");
    expect(formatFailureKind("openrouter_rate_limited")).toBe("OpenRouter rate limited this run");
    expect(formatFailureKind("internal_error")).toBe("Internal run error");
  });
});

describe("formatCostEvidence", () => {
  test("marks nonzero partial costs as unsettled billing evidence", () => {
    expect(
      formatCostEvidence({
        status: "completed",
        totalCostIsPartial: true,
        totalCostUsdMicros: 123,
      }),
    ).toBe("partial cost $0.000123");
  });
});
