import { describe, expect, test } from "vitest";
import { DEFAULT_OUTPUT_FORMATS, DEFAULT_PHASE_PROMPTS } from "./prompts";

describe("default prompt corpus", () => {
  test("keeps phase roles flat and one-shot", () => {
    expect(DEFAULT_PHASE_PROMPTS.phase1).toContain("You are a precise assistant.");
    expect(DEFAULT_PHASE_PROMPTS.phase2).toContain("You are an evaluator.");
    expect(DEFAULT_PHASE_PROMPTS.phase3).toContain("You are a precise assistant.");
  });

  test("does not depend on leading whitespace for output contract hydration", () => {
    expect(DEFAULT_OUTPUT_FORMATS.phase1).toBe("Output: Markdown.");
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain(
      "`ranking` must contain exactly every candidate ID from the input payload once.",
    );
    expect(DEFAULT_OUTPUT_FORMATS.phase3).toContain("Start with the answer.");
    for (const value of Object.values(DEFAULT_OUTPUT_FORMATS)) {
      expect(value).toBe(value.trimStart());
    }
  });
});
