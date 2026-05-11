import { describe, expect, test } from "vitest";
import { phaseTwoEvaluationResponseFormat, phaseTwoEvaluationSchema } from "./phaseEvaluation";

describe("phase-two evaluation contract", () => {
  test("accepts the canonical review shape", () => {
    const payload = {
      ranking: ["A", "B", "C", "D", "E"],
      reviews: ["A", "B", "C", "D", "E"].map((candidateId) => ({
        candidate_id: candidateId,
        strengths: [`${candidateId} strength`],
        weaknesses: [`${candidateId} weakness`],
        critical_errors: [],
        missing_evidence: [],
        verdict_input: `${candidateId} provides useful material for the verdict.`,
      })),
      best_final_answer_inputs: ["Keep the strongest factual basis."],
      major_disagreements: [],
    };

    expect(phaseTwoEvaluationSchema.parse(payload)).toEqual(payload);
  });

  test("exports one structured-output JSON schema", () => {
    expect(phaseTwoEvaluationResponseFormat).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "phase_two_evaluation",
        strict: true,
      },
    });
  });
});
