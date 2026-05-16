import {
  outputFormatsPayloadSchema,
  outputFormatsSchema,
  PHASE_TWO_CANDIDATE_IDS,
  PHASE_TWO_REVIEW_LIST_MAX_ITEMS,
  PHASE_TWO_SUMMARY_LIST_MAX_ITEMS,
  PHASE_TWO_TEXT_MAX_CHARS,
  PHASE_TWO_TEXT_MIN_CHARS,
  PHASE_TWO_VERDICT_INPUT_MAX_CHARS,
  sessionSnapshotSchema,
} from "@the-seven/contracts";
import { describe, expect, test } from "vitest";
import { BUILT_IN_COUNCILS } from "./builtInCouncils";
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
      `\`strengths\` and \`weaknesses\` must each contain 1-${PHASE_TWO_REVIEW_LIST_MAX_ITEMS} concrete candidate-specific prose items.`,
    );
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain(
      `\`critical_errors\` and \`missing_evidence\` must each contain 0-${PHASE_TWO_REVIEW_LIST_MAX_ITEMS} concrete candidate-specific prose items.`,
    );
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain(
      `\`best_final_answer_inputs\` must contain 1-${PHASE_TWO_SUMMARY_LIST_MAX_ITEMS} concrete prose items`,
    );
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain(
      `\`major_disagreements\` must contain 0-${PHASE_TWO_SUMMARY_LIST_MAX_ITEMS} concrete prose items.`,
    );
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain(
      `Every string in review lists, \`best_final_answer_inputs\`, and \`major_disagreements\` must be ${PHASE_TWO_TEXT_MIN_CHARS}-${PHASE_TWO_TEXT_MAX_CHARS} characters`,
    );
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain(
      `Every \`verdict_input\` string must be ${PHASE_TWO_TEXT_MIN_CHARS}-${PHASE_TWO_VERDICT_INPUT_MAX_CHARS} characters`,
    );
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain("The app derives the ranking from the scores.");
    for (const candidateId of PHASE_TWO_CANDIDATE_IDS) {
      expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain(`"candidate_id": "${candidateId}"`);
    }
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain(
      "Do not use placeholder values such as `...`, `A`, `1`, `n/a`, or `same same same`.",
    );
    expect(DEFAULT_OUTPUT_FORMATS.phase2).toContain(
      "Use the strongest concrete evidence, reasoning, or caveat from the highest-scoring candidates.",
    );
    expect(DEFAULT_OUTPUT_FORMATS.phase2).not.toContain(
      "Use the strongest concrete implementation path from Candidate A.",
    );
    expect(DEFAULT_OUTPUT_FORMATS.phase2).not.toContain('["..."]');
    expect(DEFAULT_OUTPUT_FORMATS.phase2).not.toContain('": "..."');
    expect(DEFAULT_OUTPUT_FORMATS.phase3).toContain("Start with the answer.");
    for (const value of Object.values(DEFAULT_OUTPUT_FORMATS)) {
      expect(value).toBe(value.trimStart());
    }
  });

  test("default output formats round-trip through public contract schemas", () => {
    expect(outputFormatsSchema.parse(DEFAULT_OUTPUT_FORMATS)).toEqual(DEFAULT_OUTPUT_FORMATS);
    expect(
      outputFormatsPayloadSchema.parse({ outputFormats: DEFAULT_OUTPUT_FORMATS }).outputFormats,
    ).toEqual(DEFAULT_OUTPUT_FORMATS);
    expect(
      sessionSnapshotSchema.parse({
        version: 1,
        createdAt: "2026-05-16T12:00:00.000Z",
        query: "Which course should the council recommend?",
        userMessage: "Which course should the council recommend?",
        attachments: [],
        outputFormats: DEFAULT_OUTPUT_FORMATS,
        council: {
          nameAtRun: BUILT_IN_COUNCILS.commons.name,
          phasePrompts: DEFAULT_PHASE_PROMPTS,
          members: BUILT_IN_COUNCILS.commons.members,
        },
      }).outputFormats,
    ).toEqual(DEFAULT_OUTPUT_FORMATS);
  });

  test("phase 3 prompt instructs the synthesizer to cite candidates and reviewers", () => {
    expect(DEFAULT_OUTPUT_FORMATS.phase3).toContain("[A]-[F]");
    expect(DEFAULT_OUTPUT_FORMATS.phase3).toContain("[R1]-[R6]");
    expect(DEFAULT_OUTPUT_FORMATS.phase3).toContain("never invent IDs");
  });

  test("phase 2 prompt does not permit empty required review categories", () => {
    expect(DEFAULT_PHASE_PROMPTS.phase2).toContain(
      "Every candidate review must include bounded material `strengths` and `weaknesses` items",
    );
    expect(DEFAULT_PHASE_PROMPTS.phase2).toContain(
      "`strengths`, `weaknesses`, and `verdict_input` require concrete candidate-specific prose",
    );
    expect(DEFAULT_PHASE_PROMPTS.phase2).toContain(
      "Use empty arrays only for `critical_errors`, `missing_evidence`, and `major_disagreements`",
    );
  });
});
