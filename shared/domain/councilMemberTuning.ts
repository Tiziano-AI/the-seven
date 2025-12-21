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

