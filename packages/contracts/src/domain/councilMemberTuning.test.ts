import { describe, expect, test } from "vitest";
import {
  councilMemberTuningInputSchema,
  councilMemberTuningSchema,
  reasoningEffortValues,
  verbosityValues,
} from "./councilMemberTuning";

function baseTuning() {
  return {
    temperature: null,
    topP: null,
    seed: null,
    verbosity: null,
    reasoningEffort: null,
    includeReasoning: null,
  };
}

describe("council member tuning contract", () => {
  test("accepts only OpenRouter-owned reasoning and verbosity enum values", () => {
    for (const reasoningEffort of reasoningEffortValues) {
      expect(
        councilMemberTuningSchema.safeParse({ ...baseTuning(), reasoningEffort }).success,
      ).toBe(true);
    }
    for (const verbosity of verbosityValues) {
      expect(councilMemberTuningSchema.safeParse({ ...baseTuning(), verbosity }).success).toBe(
        true,
      );
    }

    expect(councilMemberTuningInputSchema.safeParse({ reasoningEffort: "maximum" }).success).toBe(
      false,
    );
    expect(councilMemberTuningInputSchema.safeParse({ verbosity: "verbose" }).success).toBe(false);
    expect(councilMemberTuningInputSchema.safeParse({ reasoningEffort: "low\n" }).success).toBe(
      false,
    );
  });
});
