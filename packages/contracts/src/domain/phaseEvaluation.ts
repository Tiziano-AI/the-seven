import { z } from "zod";

export const candidateIdSchema = z.enum(["A", "B", "C", "D", "E", "F"]);
export type CandidateId = z.infer<typeof candidateIdSchema>;

export const phaseCandidateEvaluationSchema = z
  .object({
    candidate_id: candidateIdSchema,
    strengths: z.array(z.string().trim().min(1).max(1200)).min(1).max(5),
    weaknesses: z.array(z.string().trim().min(1).max(1200)).min(1).max(5),
    critical_errors: z.array(z.string().trim().min(1).max(1200)).max(5),
    missing_evidence: z.array(z.string().trim().min(1).max(1200)).max(5),
    verdict_input: z.string().trim().min(1).max(2000),
  })
  .strict();

export const phaseTwoEvaluationSchema = z
  .object({
    ranking: z.array(candidateIdSchema).min(1).max(5),
    reviews: z.array(phaseCandidateEvaluationSchema).min(1).max(5),
    best_final_answer_inputs: z.array(z.string().trim().min(1).max(1200)).min(1).max(8),
    major_disagreements: z.array(z.string().trim().min(1).max(1200)).max(8),
  })
  .strict();

export type PhaseCandidateEvaluation = z.infer<typeof phaseCandidateEvaluationSchema>;
export type PhaseTwoEvaluation = z.infer<typeof phaseTwoEvaluationSchema>;

export const phaseTwoEvaluationResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "phase_two_evaluation",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["ranking", "reviews", "best_final_answer_inputs", "major_disagreements"],
      properties: {
        ranking: {
          type: "array",
          minItems: 5,
          maxItems: 5,
          items: { type: "string", enum: ["A", "B", "C", "D", "E", "F"] },
        },
        reviews: {
          type: "array",
          minItems: 5,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "candidate_id",
              "strengths",
              "weaknesses",
              "critical_errors",
              "missing_evidence",
              "verdict_input",
            ],
            properties: {
              candidate_id: { type: "string", enum: ["A", "B", "C", "D", "E", "F"] },
              strengths: {
                type: "array",
                minItems: 1,
                maxItems: 5,
                items: { type: "string", minLength: 1, maxLength: 1200 },
              },
              weaknesses: {
                type: "array",
                minItems: 1,
                maxItems: 5,
                items: { type: "string", minLength: 1, maxLength: 1200 },
              },
              critical_errors: {
                type: "array",
                maxItems: 5,
                items: { type: "string", minLength: 1, maxLength: 1200 },
              },
              missing_evidence: {
                type: "array",
                maxItems: 5,
                items: { type: "string", minLength: 1, maxLength: 1200 },
              },
              verdict_input: { type: "string", minLength: 1, maxLength: 2000 },
            },
          },
        },
        best_final_answer_inputs: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: { type: "string", minLength: 1, maxLength: 1200 },
        },
        major_disagreements: {
          type: "array",
          maxItems: 8,
          items: { type: "string", minLength: 1, maxLength: 1200 },
        },
      },
    },
  },
} as const;
