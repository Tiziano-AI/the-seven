import fs from "fs";
import path from "path";
import { z } from "zod";
import type { OutputPhase } from "./domain/outputPhase";

const namedPromptSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  prompt: z.string().min(1),
});

const namedFormatSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  format: z.string().min(1),
});

const promptsConfigSchema = z.object({
  version: z.string().min(1),
  lastUpdated: z.string().min(1),
  description: z.string().min(1),
  phasePrompts: z.object({
    phase1: namedPromptSchema,
    phase2: namedPromptSchema,
    phase3: namedPromptSchema,
  }),
  outputFormats: z.object({
    phase1: namedFormatSchema,
    phase2: namedFormatSchema,
    phase3: namedFormatSchema,
  }),
  metadata: z.object({
    author: z.string().min(1),
    notes: z.string().min(1),
  }),
});

export type PromptsConfig = z.infer<typeof promptsConfigSchema>;

let cachedConfig: PromptsConfig | null = null;

function getPromptsConfigPath(): string {
  return path.resolve(import.meta.dirname, "..", "config", "prompts.json");
}

export function loadPromptsConfig(): PromptsConfig {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = getPromptsConfigPath();
  const raw = fs.readFileSync(configPath, "utf-8");
  const parsedJson: unknown = JSON.parse(raw);
  const parsed = promptsConfigSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const label = first ? `${first.path.join(".")}: ${first.message}` : "unknown";
    throw new Error(`Invalid prompts config at ${configPath} (${label})`);
  }

  cachedConfig = parsed.data;
  return cachedConfig;
}

export function getPhasePrompt(phase: OutputPhase): string {
  const config = loadPromptsConfig();
  if (phase === 1) return config.phasePrompts.phase1.prompt;
  if (phase === 2) return config.phasePrompts.phase2.prompt;
  return config.phasePrompts.phase3.prompt;
}

/**
 * Get output format for a specific phase
 */
export function getOutputFormat(phase: OutputPhase): string {
  const config = loadPromptsConfig();
  if (phase === 1) return config.outputFormats.phase1.format;
  if (phase === 2) return config.outputFormats.phase2.format;
  return config.outputFormats.phase3.format;
}

/**
 * Build complete system prompt with format specification
 * @param basePrompt - Raw base prompt string (already resolved)
 * @param phase - Phase number (1, 2, or 3) to determine output format
 */
export function buildSystemPrompt(
  basePrompt: string,
  phase: OutputPhase
): string {
  const formatSpec = getOutputFormat(phase);
  return `${basePrompt}${formatSpec}`;
}
