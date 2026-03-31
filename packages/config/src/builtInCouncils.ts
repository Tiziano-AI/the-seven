import type {
  BuiltInCouncilSlug,
  CouncilMembers,
  PhasePrompts,
  ProviderModelRef,
} from "@the-seven/contracts";
import { MEMBER_POSITIONS, parseCouncilMembers } from "@the-seven/contracts";
import { DEFAULT_PHASE_PROMPTS } from "./prompts";

export type ProviderModelSeed = Readonly<{ modelId: string; modelName: string }>;

const DEFAULT_MEMBER_MODELS: Record<number, ProviderModelSeed> = {
  1: { modelId: "google/gemini-3.1-pro-preview", modelName: "Gemini 3.1 Pro Preview" },
  2: { modelId: "x-ai/grok-4.20-beta", modelName: "Grok 4.20 Beta" },
  3: { modelId: "z-ai/glm-5", modelName: "GLM 5" },
  4: { modelId: "moonshotai/kimi-k2.5", modelName: "Kimi K2.5" },
  5: { modelId: "qwen/qwen3.5-397b-a17b", modelName: "Qwen3.5 397B A17B" },
  6: { modelId: "anthropic/claude-opus-4.6", modelName: "Claude Opus 4.6" },
  7: { modelId: "openai/gpt-5.4", modelName: "GPT-5.4" },
};

const LANTERN_COUNCIL_MODEL_IDS: Record<number, string> = {
  1: "deepseek/deepseek-v3.2-speciale",
  2: "mistralai/mistral-medium-3.1",
  3: "bytedance-seed/seed-2.0-lite",
  4: "amazon/nova-pro-v1",
  5: "x-ai/grok-4.1-fast",
  6: "anthropic/claude-haiku-4.5",
  7: "openai/gpt-5.4-mini",
};

const COMMONS_COUNCIL_MODEL_IDS: Record<number, string> = {
  1: "qwen/qwen3.5-122b-a10b",
  2: "google/gemini-3.1-flash-lite-preview",
  3: "openai/gpt-5.4-nano",
  4: "openai/gpt-oss-120b",
  5: "nvidia/nemotron-3-super-120b-a12b",
  6: "kwaipilot/kat-coder-pro-v2",
  7: "minimax/minimax-m2.7",
};

export type BuiltInCouncilTemplate = Readonly<{
  slug: BuiltInCouncilSlug;
  name: string;
  description: string;
  phasePrompts: PhasePrompts;
  members: CouncilMembers;
}>;

const DEFAULT_TUNING = {
  temperature: 1,
  topP: 1,
  seed: null,
  verbosity: null,
  reasoningEffort: "xhigh",
  includeReasoning: null,
} as const;

function buildCouncilMembers(models: Record<number, ProviderModelRef>): CouncilMembers {
  return parseCouncilMembers(
    MEMBER_POSITIONS.map((memberPosition) => ({
      memberPosition,
      model: models[memberPosition],
      tuning: DEFAULT_TUNING,
    })),
  );
}

export const BUILT_IN_COUNCILS: Readonly<Record<BuiltInCouncilSlug, BuiltInCouncilTemplate>> = {
  founding: {
    slug: "founding",
    name: "The Founding Council",
    description: "The flagship seven voices. GPT-5.4 delivers the verdict.",
    phasePrompts: DEFAULT_PHASE_PROMPTS,
    members: buildCouncilMembers({
      1: { provider: "openrouter", modelId: DEFAULT_MEMBER_MODELS[1].modelId },
      2: { provider: "openrouter", modelId: DEFAULT_MEMBER_MODELS[2].modelId },
      3: { provider: "openrouter", modelId: DEFAULT_MEMBER_MODELS[3].modelId },
      4: { provider: "openrouter", modelId: DEFAULT_MEMBER_MODELS[4].modelId },
      5: { provider: "openrouter", modelId: DEFAULT_MEMBER_MODELS[5].modelId },
      6: { provider: "openrouter", modelId: DEFAULT_MEMBER_MODELS[6].modelId },
      7: { provider: "openrouter", modelId: DEFAULT_MEMBER_MODELS[7].modelId },
    }),
  },
  lantern: {
    slug: "lantern",
    name: "The Lantern Council",
    description:
      "Mid-tier voices for fast, high-quality deliberation. GPT-5.4 Mini delivers the verdict.",
    phasePrompts: DEFAULT_PHASE_PROMPTS,
    members: buildCouncilMembers({
      1: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[1] },
      2: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[2] },
      3: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[3] },
      4: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[4] },
      5: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[5] },
      6: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[6] },
      7: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[7] },
    }),
  },
  commons: {
    slug: "commons",
    name: "The Commons Council",
    description: "Budget-friendly voices for demo mode. MiniMax M2.7 delivers the verdict.",
    phasePrompts: DEFAULT_PHASE_PROMPTS,
    members: buildCouncilMembers({
      1: { provider: "openrouter", modelId: COMMONS_COUNCIL_MODEL_IDS[1] },
      2: { provider: "openrouter", modelId: COMMONS_COUNCIL_MODEL_IDS[2] },
      3: { provider: "openrouter", modelId: COMMONS_COUNCIL_MODEL_IDS[3] },
      4: { provider: "openrouter", modelId: COMMONS_COUNCIL_MODEL_IDS[4] },
      5: { provider: "openrouter", modelId: COMMONS_COUNCIL_MODEL_IDS[5] },
      6: { provider: "openrouter", modelId: COMMONS_COUNCIL_MODEL_IDS[6] },
      7: { provider: "openrouter", modelId: COMMONS_COUNCIL_MODEL_IDS[7] },
    }),
  },
};

export const BUILT_IN_MODEL_SEEDS: ReadonlyArray<ProviderModelSeed> = Object.values(
  BUILT_IN_COUNCILS,
).flatMap((council) =>
  council.members.map((member) => ({
    modelId: member.model.modelId,
    modelName: member.model.modelId,
  })),
);
