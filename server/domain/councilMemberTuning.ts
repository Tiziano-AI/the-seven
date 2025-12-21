import { z } from "zod";
import type { CouncilMemberTuning } from "../../shared/domain/councilMemberTuning";
import { isSingleLine } from "../../shared/domain/strings";

export const councilMemberTuningSchema = z
  .object({
    temperature: z.number().finite().nullable().optional(),
    seed: z
      .number()
      .int()
      .nullable()
      .optional()
      .refine(
        (value) => value === null || value === undefined || Number.isSafeInteger(value),
        "seed must be a safe integer"
      ),
    verbosity: z
      .string()
      .trim()
      .min(1)
      .refine(isSingleLine, "verbosity must be single-line")
      .nullable()
      .optional(),
    reasoningEffort: z
      .string()
      .trim()
      .min(1)
      .refine(isSingleLine, "reasoningEffort must be single-line")
      .nullable()
      .optional(),
    includeReasoning: z.boolean().nullable().optional(),
  })
  .strict();

export type CouncilMemberTuningInput = z.infer<typeof councilMemberTuningSchema>;

function normalizeCouncilMemberTuningParsed(input: CouncilMemberTuningInput): CouncilMemberTuning | null {
  const normalized: CouncilMemberTuning = {
    temperature: input.temperature ?? null,
    seed: input.seed ?? null,
    verbosity: input.verbosity ?? null,
    reasoningEffort: input.reasoningEffort ?? null,
    includeReasoning: input.includeReasoning ?? null,
  };

  if (
    normalized.temperature === null &&
    normalized.seed === null &&
    normalized.verbosity === null &&
    normalized.reasoningEffort === null &&
    normalized.includeReasoning === null
  ) {
    return null;
  }

  return normalized;
}

export function normalizeCouncilMemberTuningInput(
  value: CouncilMemberTuningInput | null | undefined
): CouncilMemberTuning | null {
  if (!value) return null;
  return normalizeCouncilMemberTuningParsed(value);
}

export function parseCouncilMemberTuningJson(value: string | null): CouncilMemberTuning | null {
  if (value === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Invalid council member tuning JSON");
  }

  const validated = councilMemberTuningSchema.parse(parsed);
  return normalizeCouncilMemberTuningParsed(validated);
}

export function stringifyCouncilMemberTuningJson(tuning: CouncilMemberTuning | null): string | null {
  if (!tuning) return null;
  return JSON.stringify(tuning);
}
