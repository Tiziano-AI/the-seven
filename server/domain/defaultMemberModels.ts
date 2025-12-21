import type { MemberPosition } from "../../shared/domain/sevenMembers";

export type ProviderModelSeed = Readonly<{ modelId: string; modelName: string }>;

export const DEFAULT_MEMBER_MODELS: Record<MemberPosition, ProviderModelSeed> = {
  1: { modelId: "openai/gpt-5.2", modelName: "GPT-5.2" },
  2: { modelId: "google/gemini-3-pro-preview", modelName: "Gemini 3 Pro Preview" },
  3: { modelId: "anthropic/claude-opus-4.5", modelName: "Claude Opus 4.5" },
  4: { modelId: "x-ai/grok-4", modelName: "Grok 4" },
  5: { modelId: "qwen/qwen3-max", modelName: "Qwen3 Max" },
  6: { modelId: "deepseek/deepseek-v3.2-speciale", modelName: "DeepSeek V3.2 Speciale" },
  7: { modelId: "openai/gpt-5.2-pro", modelName: "GPT-5.2 Pro" },
};
