import { z } from "zod";

export const reasoningEffortValues = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
export const verbosityValues = ["low", "medium", "high", "xhigh", "max"] as const;

export type ReasoningEffort = (typeof reasoningEffortValues)[number];
export type Verbosity = (typeof verbosityValues)[number];

export type CouncilMemberTuning = Readonly<{
  temperature: number | null;
  topP: number | null;
  seed: number | null;
  verbosity: Verbosity | null;
  reasoningEffort: ReasoningEffort | null;
  includeReasoning: boolean | null;
}>;

const baseSchema = z.object({
  temperature: z.number().finite().nullable(),
  topP: z.number().min(0).max(1).nullable(),
  seed: z.number().int().nullable(),
  verbosity: z.enum(verbosityValues).nullable(),
  reasoningEffort: z.enum(reasoningEffortValues).nullable(),
  includeReasoning: z.boolean().nullable(),
});

export const councilMemberTuningSchema = baseSchema.strict();
export const councilMemberTuningInputSchema = baseSchema.partial().strict();
export type CouncilMemberTuningInput = z.infer<typeof councilMemberTuningInputSchema>;
