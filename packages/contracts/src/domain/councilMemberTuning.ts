import { z } from "zod";
import { isSingleLine } from "./strings";

export type CouncilMemberTuning = Readonly<{
  temperature: number | null;
  topP: number | null;
  seed: number | null;
  verbosity: string | null;
  reasoningEffort: string | null;
  includeReasoning: boolean | null;
}>;

const baseSchema = z.object({
  temperature: z.number().finite().nullable(),
  topP: z.number().min(0).max(1).nullable(),
  seed: z.number().int().nullable(),
  verbosity: z
    .string()
    .trim()
    .min(1)
    .refine(isSingleLine, "verbosity must be single-line")
    .nullable(),
  reasoningEffort: z
    .string()
    .trim()
    .min(1)
    .refine(isSingleLine, "reasoningEffort must be single-line")
    .nullable(),
  includeReasoning: z.boolean().nullable(),
});

export const councilMemberTuningSchema = baseSchema.strict();
export const councilMemberTuningInputSchema = baseSchema.partial().strict();
export type CouncilMemberTuningInput = z.infer<typeof councilMemberTuningInputSchema>;
