import { z } from "zod";

export const MAX_PHASE_PROMPT_CHARS = 6000;
export const MAX_OUTPUT_FORMAT_CHARS = 3000;

export type PhasePrompts = Readonly<{
  phase1: string;
  phase2: string;
  phase3: string;
}>;

export const phasePromptTextSchema = z.string().trim().min(1).max(MAX_PHASE_PROMPT_CHARS);
export const outputFormatTextSchema = z.string().trim().min(1).max(MAX_OUTPUT_FORMAT_CHARS);

export const phasePromptsSchema = z
  .object({
    phase1: phasePromptTextSchema,
    phase2: phasePromptTextSchema,
    phase3: phasePromptTextSchema,
  })
  .strict();

export const outputFormatsSchema = z
  .object({
    phase1: outputFormatTextSchema,
    phase2: outputFormatTextSchema,
    phase3: outputFormatTextSchema,
  })
  .strict();

export type OutputFormats = z.infer<typeof outputFormatsSchema>;
