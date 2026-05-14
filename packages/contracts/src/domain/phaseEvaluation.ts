import { z } from "zod";

export const PHASE_TWO_CANDIDATE_IDS = ["A", "B", "C", "D", "E", "F"] as const;
export const candidateIdSchema = z.enum(PHASE_TWO_CANDIDATE_IDS);
export type CandidateId = z.infer<typeof candidateIdSchema>;

/** Minimum characters for material phase-2 review strings. */
export const PHASE_TWO_TEXT_MIN_CHARS = 12;

/** Provider-visible positive prose pattern for material phase-2 review strings. */
export const PHASE_TWO_MATERIAL_TEXT_PATTERN =
  "[A-Za-z][A-Za-z0-9'-]*(?:[^A-Za-z0-9'-]+[A-Za-z][A-Za-z0-9'-]*)+";

/** Maximum characters for regular phase-2 review list entries and summaries. */
export const PHASE_TWO_TEXT_MAX_CHARS = 1200;

/** Maximum characters for the per-candidate phase-2 verdict input string. */
export const PHASE_TWO_VERDICT_INPUT_MAX_CHARS = 2000;

/** Maximum items in each per-candidate phase-2 review list. */
export const PHASE_TWO_REVIEW_LIST_MAX_ITEMS = 5;

/** Maximum items in each phase-level phase-2 summary list. */
export const PHASE_TWO_SUMMARY_LIST_MAX_ITEMS = 8;

function candidateOrder(candidateId: CandidateId): number {
  return PHASE_TWO_CANDIDATE_IDS.indexOf(candidateId);
}

const materialTextTokenPattern = /[A-Za-z][A-Za-z0-9'-]*/g;

function hasMaterialText(value: string): boolean {
  const tokens = value.match(materialTextTokenPattern) ?? [];
  if (tokens.length < 2 || !tokens.some((token) => token.length >= 3)) {
    return false;
  }
  const normalizedTokens = tokens.map((token) => token.toLowerCase());
  return new Set(normalizedTokens).size >= 2;
}

/** Derives the canonical phase-2 ranking from review scores with candidate-order tie-breaking. */
export function rankPhaseTwoCandidatesByScore(
  reviews: Record<CandidateId, Readonly<{ score: number }>>,
): CandidateId[] {
  return [...PHASE_TWO_CANDIDATE_IDS].sort((left, right) => {
    const scoreDifference = reviews[right].score - reviews[left].score;
    return scoreDifference === 0 ? candidateOrder(left) - candidateOrder(right) : scoreDifference;
  });
}

function materialStringSchemaWithMax(maxCharacters: number) {
  return z
    .string()
    .trim()
    .min(PHASE_TWO_TEXT_MIN_CHARS)
    .max(maxCharacters)
    .refine(hasMaterialText, "Phase 2 text must contain material prose");
}

const materialStringSchema = materialStringSchemaWithMax(PHASE_TWO_TEXT_MAX_CHARS);
const materialVerdictStringSchema = materialStringSchemaWithMax(PHASE_TWO_VERDICT_INPUT_MAX_CHARS);

export const phaseCandidateEvaluationSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    strengths: z.array(materialStringSchema).min(1).max(PHASE_TWO_REVIEW_LIST_MAX_ITEMS),
    weaknesses: z.array(materialStringSchema).min(1).max(PHASE_TWO_REVIEW_LIST_MAX_ITEMS),
    critical_errors: z.array(materialStringSchema).max(PHASE_TWO_REVIEW_LIST_MAX_ITEMS),
    missing_evidence: z.array(materialStringSchema).max(PHASE_TWO_REVIEW_LIST_MAX_ITEMS),
    verdict_input: materialVerdictStringSchema,
  })
  .strict();

export const phaseCandidateReviewsSchema = z
  .object({
    A: phaseCandidateEvaluationSchema,
    B: phaseCandidateEvaluationSchema,
    C: phaseCandidateEvaluationSchema,
    D: phaseCandidateEvaluationSchema,
    E: phaseCandidateEvaluationSchema,
    F: phaseCandidateEvaluationSchema,
  })
  .strict();

export const phaseCandidateEvaluationRowSchema = phaseCandidateEvaluationSchema
  .extend({
    candidate_id: candidateIdSchema,
  })
  .strict();

export const phaseCandidateEvaluationRowsSchema = z
  .array(phaseCandidateEvaluationRowSchema)
  .length(PHASE_TWO_CANDIDATE_IDS.length)
  .superRefine((rows, context) => {
    const seen = new Set<CandidateId>();
    rows.forEach((row, index) => {
      if (seen.has(row.candidate_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "candidate_id"],
          message: "Phase 2 reviews must include each candidate exactly once",
        });
      }
      seen.add(row.candidate_id);
    });

    for (const candidateId of PHASE_TWO_CANDIDATE_IDS) {
      if (!seen.has(candidateId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [],
          message: "Phase 2 reviews must include each candidate exactly once",
        });
      }
    }
  });

export const phaseTwoEvaluationResponseSchema = z
  .object({
    reviews: phaseCandidateEvaluationRowsSchema,
    best_final_answer_inputs: z
      .array(materialStringSchema)
      .min(1)
      .max(PHASE_TWO_SUMMARY_LIST_MAX_ITEMS),
    major_disagreements: z.array(materialStringSchema).max(PHASE_TWO_SUMMARY_LIST_MAX_ITEMS),
  })
  .strict();

const phaseCandidateRankingSchema = z
  .array(candidateIdSchema)
  .length(PHASE_TWO_CANDIDATE_IDS.length)
  .refine((candidateIds) => new Set(candidateIds).size === PHASE_TWO_CANDIDATE_IDS.length, {
    message: "Phase 2 ranking must include each candidate exactly once",
  });

export const phaseTwoEvaluationSchema = z
  .object({
    ranking: phaseCandidateRankingSchema,
    reviews: phaseCandidateReviewsSchema,
    best_final_answer_inputs: z
      .array(materialStringSchema)
      .min(1)
      .max(PHASE_TWO_SUMMARY_LIST_MAX_ITEMS),
    major_disagreements: z.array(materialStringSchema).max(PHASE_TWO_SUMMARY_LIST_MAX_ITEMS),
  })
  .strict()
  .superRefine((evaluation, context) => {
    const expectedRanking = rankPhaseTwoCandidatesByScore(evaluation.reviews);
    if (
      evaluation.ranking.length !== expectedRanking.length ||
      evaluation.ranking.some((candidateId, index) => candidateId !== expectedRanking[index])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ranking"],
        message: "Phase 2 ranking must match score-derived order",
      });
    }
  });

export type PhaseCandidateEvaluation = z.infer<typeof phaseCandidateEvaluationSchema>;
export type PhaseCandidateEvaluationRow = z.infer<typeof phaseCandidateEvaluationRowSchema>;
export type PhaseTwoEvaluationResponse = z.infer<typeof phaseTwoEvaluationResponseSchema>;
export type PhaseTwoEvaluation = z.infer<typeof phaseTwoEvaluationSchema>;
type PhaseTwoEvaluationCanonicalResponse = Readonly<{
  reviews: z.infer<typeof phaseCandidateReviewsSchema>;
  best_final_answer_inputs: string[];
  major_disagreements: string[];
}>;

function reviewForCandidate(
  rows: ReadonlyArray<PhaseCandidateEvaluationRow>,
  candidateId: CandidateId,
): PhaseCandidateEvaluation {
  const row = rows.find((candidateRow) => candidateRow.candidate_id === candidateId);
  if (!row) {
    throw new Error(`Phase 2 reviews are missing candidate ${candidateId}`);
  }

  return {
    score: row.score,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    critical_errors: row.critical_errors,
    missing_evidence: row.missing_evidence,
    verdict_input: row.verdict_input,
  };
}

/** Normalizes the compact provider response into the canonical persisted review map. */
export function normalizePhaseTwoEvaluationResponse(
  response: PhaseTwoEvaluationResponse,
): PhaseTwoEvaluationCanonicalResponse {
  return {
    reviews: {
      A: reviewForCandidate(response.reviews, "A"),
      B: reviewForCandidate(response.reviews, "B"),
      C: reviewForCandidate(response.reviews, "C"),
      D: reviewForCandidate(response.reviews, "D"),
      E: reviewForCandidate(response.reviews, "E"),
      F: reviewForCandidate(response.reviews, "F"),
    },
    best_final_answer_inputs: response.best_final_answer_inputs,
    major_disagreements: response.major_disagreements,
  };
}

const phaseCandidateEvaluationJsonSchema = {
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
    strengths: {
      type: "array",
      items: { type: "string" },
    },
    weaknesses: {
      type: "array",
      items: { type: "string" },
    },
    critical_errors: {
      type: "array",
      items: { type: "string" },
    },
    missing_evidence: {
      type: "array",
      items: { type: "string" },
    },
    verdict_input: { type: "string" },
  },
} as const;

export const phaseTwoEvaluationResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "phase_two_evaluation",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["reviews", "best_final_answer_inputs", "major_disagreements"],
      properties: {
        reviews: {
          type: "array",
          items: phaseCandidateEvaluationJsonSchema,
        },
        best_final_answer_inputs: {
          type: "array",
          items: { type: "string" },
        },
        major_disagreements: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
} as const;
