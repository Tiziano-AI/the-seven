import { z } from "zod";

export type PhasePrompts = Readonly<{
  phase1: string;
  phase2: string;
  phase3: string;
}>;

export const phasePromptsSchema = z.object({
  phase1: z.string().min(1),
  phase2: z.string().min(1),
  phase3: z.string().min(1),
});

export const outputFormatsSchema = z.object({
  phase1: z.string().min(1),
  phase2: z.string().min(1),
  phase3: z.string().min(1),
});

export type OutputFormats = z.infer<typeof outputFormatsSchema>;
