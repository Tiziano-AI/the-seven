import { PHASE_TWO_CANDIDATE_IDS } from "@the-seven/contracts";
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
      `\`reviews\` must be an array with exactly one row for each candidate_id: ${PHASE_TWO_CANDIDATE_IDS.join(", ")}.`,
    );
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain(
      "Each review row must include `candidate_id`, `score`, `strengths`, `weaknesses`, `critical_errors`, `missing_evidence`, and `verdict_input`.",
    );
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain(
      "`strengths` and `weaknesses` must each contain at least one material candidate-specific prose item",
    );
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain(
      "Use empty arrays only for `critical_errors`, `missing_evidence`, and `major_disagreements`",
    );
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain(
      "`best_final_answer_inputs` must contain material prose",
    );
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain("at least two distinct words");
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain("The app derives the ranking from the scores.");
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain('"candidate_id": "A"');
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain(
      "Do not use placeholder values such as `...`, `A`, `1`, `n/a`, `same same same`, or field labels as content.",
    );
    expect(DEFAULT_OUTPUT_FORMATS.phase2).not.toContain('["..."]');
    expect(DEFAULT_OUTPUT_FORMATS.phase2).not.toContain('": "..."');
    expect(DEFAULT_OUTPUT_FORMATS.phase3).toContain("Start with the answer.");
    for (const value of Object.values(DEFAULT_OUTPUT_FORMATS)) {
      expect(value).toBe(value.trimStart());
    }
  });

  test("phase 3 prompt instructs the synthesizer to cite candidates and reviewers", () => {
    expect(DEFAULT_OUTPUT_FORMATS.phase3).toContain("[A]-[F]");
    expect(DEFAULT_OUTPUT_FORMATS.phase3).toContain("[R1]-[R6]");
    expect(DEFAULT_OUTPUT_FORMATS.phase3).toContain("never invent IDs");
  });

  test("phase 2 prompt does not permit empty required review categories", () => {
    expect(DEFAULT_PHASE_PROMPTS.phase2).toContain(
      "Every candidate review must include at least one material `strengths` item and at least one material `weaknesses` item",
    );
    expect(DEFAULT_PHASE_PROMPTS.phase2).toContain(
      "`strengths`, `weaknesses`, and `verdict_input` require material candidate-specific prose",
    );
    expect(DEFAULT_PHASE_PROMPTS.phase2).toContain(
      "Use empty arrays only for `critical_errors`, `missing_evidence`, and `major_disagreements`",
    );
  });
});
