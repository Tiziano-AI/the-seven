import type {
  BuiltInCouncilSlug,
  CouncilMembers,
  CouncilMemberTuning,
  PhasePrompts,
  ProviderModelRef,
} from "@the-seven/contracts";
import { MEMBER_POSITIONS, parseCouncilMembers } from "@the-seven/contracts";
import { DEFAULT_PHASE_PROMPTS } from "./prompts";

export type ProviderModelSeed = Readonly<{ modelId: string; modelName: string }>;

const FOUNDING_COUNCIL_MODEL_IDS: Record<number, string> = {
  1: "google/gemini-3.1-pro-preview",
  2: "anthropic/claude-opus-4.7",
  3: "x-ai/grok-4.3",
  4: "deepseek/deepseek-v4-pro",
  5: "xiaomi/mimo-v2.5-pro",
  6: "moonshotai/kimi-k2.6",
  7: "openai/gpt-5.5-pro",
};

const LANTERN_COUNCIL_MODEL_IDS: Record<number, string> = {
  1: "deepseek/deepseek-v4-pro",
  2: "qwen/qwen3.6-plus",
  3: "xiaomi/mimo-v2.5",
  4: "minimax/minimax-m2.7",
  5: "z-ai/glm-5.1",
  6: "mistralai/mistral-medium-3-5",
  7: "anthropic/claude-sonnet-4.6",
};

const COMMONS_COUNCIL_MODEL_IDS: Record<number, string> = {
  1: "google/gemini-3.1-flash-lite",
  2: "deepseek/deepseek-v4-flash",
  3: "qwen/qwen3.6-35b-a3b",
  4: "minimax/minimax-m2.7",
  5: "mistralai/mistral-small-2603",
  6: "z-ai/glm-4.7-flash",
  7: "openai/gpt-5.4-nano",
};

export type BuiltInCouncilTemplate = Readonly<{
  slug: BuiltInCouncilSlug;
  name: string;
  description: string;
  phasePrompts: PhasePrompts;
  members: CouncilMembers;
}>;

const FULL_DEFAULT_TUNING = {
  temperature: 1,
  topP: 1,
  seed: null,
  verbosity: null,
  reasoningEffort: "xhigh",
  includeReasoning: null,
} as const satisfies CouncilMemberTuning;

const MODEL_TUNING_DEFAULTS: Record<string, CouncilMemberTuning> = {
  "anthropic/claude-opus-4.7": { ...FULL_DEFAULT_TUNING, temperature: null, topP: null },
  "openai/gpt-5.4-nano": { ...FULL_DEFAULT_TUNING, temperature: null, topP: null },
  "openai/gpt-5.5-pro": { ...FULL_DEFAULT_TUNING, temperature: null, topP: null },
};

function defaultTuningForModel(modelId: string) {
  return MODEL_TUNING_DEFAULTS[modelId] ?? FULL_DEFAULT_TUNING;
}

function buildCouncilMembers(models: Record<number, ProviderModelRef>): CouncilMembers {
  return parseCouncilMembers(
    MEMBER_POSITIONS.map((memberPosition) => ({
      memberPosition,
      model: models[memberPosition],
      tuning: defaultTuningForModel(models[memberPosition].modelId),
    })),
  );
}

export const BUILT_IN_COUNCILS: Readonly<Record<BuiltInCouncilSlug, BuiltInCouncilTemplate>> = {
  founding: {
    slug: "founding",
    name: "The Founding Council",
    description: "The BYOK best-of-best roster. GPT-5.5 Pro delivers the verdict.",
    phasePrompts: DEFAULT_PHASE_PROMPTS,
    members: buildCouncilMembers({
      1: { provider: "openrouter", modelId: FOUNDING_COUNCIL_MODEL_IDS[1] },
      2: { provider: "openrouter", modelId: FOUNDING_COUNCIL_MODEL_IDS[2] },
      3: { provider: "openrouter", modelId: FOUNDING_COUNCIL_MODEL_IDS[3] },
      4: { provider: "openrouter", modelId: FOUNDING_COUNCIL_MODEL_IDS[4] },
      5: { provider: "openrouter", modelId: FOUNDING_COUNCIL_MODEL_IDS[5] },
      6: { provider: "openrouter", modelId: FOUNDING_COUNCIL_MODEL_IDS[6] },
      7: { provider: "openrouter", modelId: FOUNDING_COUNCIL_MODEL_IDS[7] },
    }),
  },
  lantern: {
    slug: "lantern",
    name: "The Lantern Council",
    description: "Deliberate mid-tier bridge voices. Claude Sonnet 4.6 delivers the verdict.",
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
    description: "Paid low-cost demo voices. GPT-5.4 Nano delivers the verdict.",
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
