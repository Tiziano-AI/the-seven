import { z } from "zod";

/**
 * Validates canonical per-phase prompt payloads.
 */
export const phasePromptsSchema = z.object({
  phase1: z.string().min(1),
  phase2: z.string().min(1),
  phase3: z.string().min(1),
});

/**
 * Inferred input type for phase prompt payloads.
 */
export type PhasePromptsInput = z.infer<typeof phasePromptsSchema>;
