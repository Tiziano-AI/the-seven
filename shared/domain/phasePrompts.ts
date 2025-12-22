import { z } from "zod";

/**
 * Canonical per-phase prompt payload used across server and client.
 */
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
