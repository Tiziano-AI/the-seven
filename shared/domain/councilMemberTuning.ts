import { z } from "zod";
import { isSingleLine } from "./strings";

export type CouncilMemberTuning = Readonly<{
  /**
   * OpenRouter `temperature` (when set).
   */
  temperature: number | null;
  /**
   * OpenRouter `seed` (when set).
   */
  seed: number | null;
  /**
   * OpenRouter `verbosity` (when set).
   *
   * UI exposes recommended presets plus a custom string input.
   */
  verbosity: string | null;
  /**
   * OpenRouter `reasoning: { effort: ... }` (when set).
   *
   * UI exposes recommended presets plus a custom string input.
   */
  reasoningEffort: string | null;
  /**
   * OpenRouter `include_reasoning` (when set).
   */
  includeReasoning: boolean | null;
}>;

const councilMemberTuningBaseSchema = z.object({
  temperature: z.number().finite().nullable(),
  seed: z
    .number()
    .int()
    .nullable()
    .refine((value) => value === null || Number.isSafeInteger(value), "seed must be a safe integer"),
  verbosity: z.string().trim().min(1).refine(isSingleLine, "verbosity must be single-line").nullable(),
  reasoningEffort: z.string().trim().min(1).refine(isSingleLine, "reasoningEffort must be single-line").nullable(),
  includeReasoning: z.boolean().nullable(),
});

export const councilMemberTuningSchema = councilMemberTuningBaseSchema.strict();

export const councilMemberTuningInputSchema = councilMemberTuningBaseSchema.partial().strict();

export type CouncilMemberTuningInput = z.infer<typeof councilMemberTuningInputSchema>;
