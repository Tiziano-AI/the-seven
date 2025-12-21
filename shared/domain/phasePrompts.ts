/**
 * Canonical per-phase prompt payload used across server and client.
 */
export type PhasePrompts = Readonly<{
  phase1: string;
  phase2: string;
  phase3: string;
}>;
