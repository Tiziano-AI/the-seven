import { describe, expect, test } from "vitest";
import {
  type CandidateId,
  PHASE_TWO_REVIEW_LIST_MAX_ITEMS,
  PHASE_TWO_SUMMARY_LIST_MAX_ITEMS,
  PHASE_TWO_TEXT_MAX_CHARS,
  PHASE_TWO_VERDICT_INPUT_MAX_CHARS,
  phaseTwoEvaluationResponseFormat,
  phaseTwoEvaluationResponseSchema,
  phaseTwoEvaluationSchema,
  rankPhaseTwoCandidatesByScore,
} from "./phaseEvaluation";

describe("phase-two evaluation contract", () => {
  test("accepts the canonical review shape", () => {
    const payload = {
      ranking: ["A", "B", "C", "D", "E", "F"],
      reviews: {
        A: review("A", 90),
        B: review("B", 80),
        C: review("C", 70),
        D: review("D", 60),
        E: review("E", 50),
        F: review("F", 40),
      },
      best_final_answer_inputs: ["Keep the strongest factual basis."],
      major_disagreements: [],
    };

    expect(phaseTwoEvaluationSchema.parse(payload)).toEqual(payload);
  });

  test("rejects persisted rankings that are not exact candidate permutations", () => {
    const payload = {
      ranking: ["A", "A", "C", "D", "E", "F"],
      reviews: {
        A: review("A", 90),
        B: review("B", 80),
        C: review("C", 70),
        D: review("D", 60),
        E: review("E", 50),
        F: review("F", 40),
      },
      best_final_answer_inputs: ["Keep the strongest factual basis."],
      major_disagreements: [],
    };

    expect(() => phaseTwoEvaluationSchema.parse(payload)).toThrow(
      "Phase 2 ranking must include each candidate exactly once",
    );
  });

  test("rejects persisted rankings that do not match score-derived order", () => {
    const payload = {
      ranking: ["A", "B", "C", "D", "E", "F"],
      reviews: {
        A: review("A", 90),
        B: review("B", 80),
        C: review("C", 70),
        D: review("D", 100),
        E: review("E", 50),
        F: review("F", 40),
      },
      best_final_answer_inputs: ["Keep the strongest factual basis."],
      major_disagreements: [],
    };

    expect(rankPhaseTwoCandidatesByScore(payload.reviews)).toEqual(["D", "A", "B", "C", "E", "F"]);
    expect(() => phaseTwoEvaluationSchema.parse(payload)).toThrow(
      "Phase 2 ranking must match score-derived order",
    );
  });

  test("breaks score ties by candidate order", () => {
    expect(
      rankPhaseTwoCandidatesByScore({
        A: review("A", 90),
        B: review("B", 90),
        C: review("C", 70),
        D: review("D", 60),
        E: review("E", 50),
        F: review("F", 40),
      }),
    ).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  test("exports one compact structured-output JSON schema", () => {
    const schema = phaseTwoEvaluationResponseFormat.json_schema.schema;
    expect(phaseTwoEvaluationResponseFormat).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "phase_two_evaluation",
        strict: true,
      },
    });
    expect(schema.required).toEqual(["reviews", "best_final_answer_inputs", "major_disagreements"]);
    expect(schema.properties).not.toHaveProperty("ranking");
    expect(schema.properties.reviews).toEqual({
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "candidate_id",
          "score",
          "strengths",
          "weaknesses",
          "critical_errors",
          "missing_evidence",
          "verdict_input",
        ],
        properties: {
          candidate_id: { type: "string" },
          score: { type: "integer" },
          strengths: { type: "array", items: { type: "string" } },
          weaknesses: { type: "array", items: { type: "string" } },
          critical_errors: { type: "array", items: { type: "string" } },
          missing_evidence: { type: "array", items: { type: "string" } },
          verdict_input: { type: "string" },
        },
      },
    });
    expect(schema.properties.best_final_answer_inputs).toEqual({
      type: "array",
      items: { type: "string" },
    });
    expect(schema.properties.major_disagreements).toEqual({
      type: "array",
      items: { type: "string" },
    });
  });

  test("keeps semantic bounds out of the portable provider schema", () => {
    const schema = phaseTwoEvaluationResponseFormat.json_schema.schema;
    expect(schema.properties.reviews).not.toHaveProperty("minItems");
    expect(schema.properties.reviews).not.toHaveProperty("maxItems");
    const reviewSchema = schema.properties.reviews.items;
    expect(reviewSchema.properties.candidate_id).not.toHaveProperty("enum");
    expect(reviewSchema.properties.score).not.toHaveProperty("minimum");
    expect(reviewSchema.properties.score).not.toHaveProperty("maximum");
    expect(reviewSchema.properties.strengths).not.toHaveProperty("minItems");
    expect(reviewSchema.properties.strengths).not.toHaveProperty("maxItems");
    expect(reviewSchema.properties.verdict_input).not.toHaveProperty("maxLength");
    expect(schema.properties.best_final_answer_inputs).not.toHaveProperty("maxItems");
  });

  test("does not export a second material-prose regex contract", async () => {
    const phaseEvaluation = await import("./phaseEvaluation");

    expect(phaseEvaluation).not.toHaveProperty("PHASE_TWO_MATERIAL_TEXT_PATTERN");
  });

  test("keeps compact provider responses under strict app-owned material parsing", () => {
    const payload = {
      reviews: [
        reviewRow("C", 80),
        reviewRow("A", 10),
        reviewRow("F", 50),
        reviewRow("B", 60),
        reviewRow("E", 70),
        reviewRow("D", 30),
      ],
      best_final_answer_inputs: ["Keep the strongest factual basis."],
      major_disagreements: [],
    };

    expect(phaseTwoEvaluationResponseSchema.parse(payload)).toEqual(payload);

    for (const invalidPayload of [
      {
        ...payload,
        reviews: payload.reviews.map((row) =>
          row.candidate_id === "A" ? { ...row, strengths: ["   "] } : row,
        ),
      },
      {
        ...payload,
        reviews: payload.reviews.map((row) =>
          row.candidate_id === "A" ? { ...row, weaknesses: ["\n\t"] } : row,
        ),
      },
      {
        ...payload,
        reviews: payload.reviews.map((row) =>
          row.candidate_id === "A" ? { ...row, verdict_input: "   " } : row,
        ),
      },
      {
        ...payload,
        reviews: payload.reviews.map((row) =>
          row.candidate_id === "A" ? { ...row, strengths: ["AAAAAAAAAAAA"] } : row,
        ),
      },
      {
        ...payload,
        reviews: payload.reviews.map((row) =>
          row.candidate_id === "A" ? { ...row, weaknesses: ["111111111111"] } : row,
        ),
      },
      {
        ...payload,
        reviews: payload.reviews.map((row) =>
          row.candidate_id === "A" ? { ...row, verdict_input: "... ... ... ..." } : row,
        ),
      },
      {
        ...payload,
        reviews: payload.reviews.map((row) =>
          row.candidate_id === "A" ? { ...row, verdict_input: "same same same" } : row,
        ),
      },
      {
        ...payload,
        reviews: payload.reviews.map((row) =>
          row.candidate_id === "A"
            ? { ...row, strengths: ["x".repeat(PHASE_TWO_TEXT_MAX_CHARS + 1)] }
            : row,
        ),
      },
      {
        ...payload,
        reviews: payload.reviews.map((row) =>
          row.candidate_id === "A"
            ? {
                ...row,
                strengths: Array.from(
                  { length: PHASE_TWO_REVIEW_LIST_MAX_ITEMS + 1 },
                  (_, index) => `Candidate A strength item ${index} has concrete evidence.`,
                ),
              }
            : row,
        ),
      },
      {
        ...payload,
        reviews: payload.reviews.map((row) =>
          row.candidate_id === "A"
            ? { ...row, verdict_input: "x".repeat(PHASE_TWO_VERDICT_INPUT_MAX_CHARS + 1) }
            : row,
        ),
      },
      { ...payload, reviews: payload.reviews.slice(1) },
      {
        ...payload,
        reviews: payload.reviews.map((row) =>
          row.candidate_id === "F" ? { ...row, candidate_id: "A" } : row,
        ),
      },
      { ...payload, best_final_answer_inputs: ["   "] },
      { ...payload, best_final_answer_inputs: ["x".repeat(PHASE_TWO_TEXT_MAX_CHARS + 1)] },
      {
        ...payload,
        best_final_answer_inputs: Array.from(
          { length: PHASE_TWO_SUMMARY_LIST_MAX_ITEMS + 1 },
          (_, index) => `Final answer input item ${index} keeps concrete launch evidence.`,
        ),
      },
      { ...payload, major_disagreements: ["\n"] },
      {
        ...payload,
        major_disagreements: Array.from(
          { length: PHASE_TWO_SUMMARY_LIST_MAX_ITEMS + 1 },
          (_, index) => `Major disagreement item ${index} names a concrete tradeoff.`,
        ),
      },
    ]) {
      expect(() => phaseTwoEvaluationResponseSchema.parse(invalidPayload)).toThrow();
    }
  });
});

function review(candidateId: CandidateId, score: number) {
  return {
    score,
    strengths: [`Candidate ${candidateId} identifies concrete support.`],
    weaknesses: [`Candidate ${candidateId} misses a concrete caveat.`],
    critical_errors: [],
    missing_evidence: [],
    verdict_input: `${candidateId} provides useful material for the verdict.`,
  };
}

function reviewRow(candidateId: CandidateId, score: number) {
  return {
    candidate_id: candidateId,
    ...review(candidateId, score),
  };
}
