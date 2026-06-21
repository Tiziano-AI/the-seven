import type {
  BuiltInCouncilSlug,
  CouncilMembers,
  CouncilMemberTuning,
  MemberPosition,
  PhasePrompts,
  ProviderModelRef,
} from "@the-seven/contracts";
import { MEMBER_POSITIONS, parseCouncilMembers } from "@the-seven/contracts";
import { DEFAULT_PHASE_PROMPTS } from "./prompts";

export type ProviderModelSeed = Readonly<{ modelId: string; modelName: string }>;

const FOUNDING_COUNCIL_MODEL_IDS: Record<MemberPosition, string> = {
  1: "openai/gpt-5.5",
  2: "anthropic/claude-opus-4.8",
  3: "z-ai/glm-5.2",
  4: "google/gemini-3.5-flash",
  5: "qwen/qwen3.7-max",
  6: "x-ai/grok-4.3",
  7: "openai/gpt-5.5",
};

const LANTERN_COUNCIL_MODEL_IDS: Record<MemberPosition, string> = {
  1: "anthropic/claude-sonnet-4.6",
  2: "deepseek/deepseek-v4-pro",
  3: "z-ai/glm-5.1",
  4: "qwen/qwen3.6-plus",
  5: "google/gemini-3-flash-preview",
  6: "mistralai/mistral-medium-3-5",
  7: "qwen/qwen3.6-max-preview",
};

const COMMONS_COUNCIL_MODEL_IDS: Record<MemberPosition, string> = {
  1: "qwen/qwen3.6-35b-a3b",
  2: "google/gemini-3.1-flash-lite",
  3: "openai/gpt-5-mini",
  4: "deepseek/deepseek-v4-flash",
  5: "openai/gpt-5-nano",
  6: "mistralai/mistral-small-2603",
  7: "minimax/minimax-m2.7",
};

const BUILT_IN_MODEL_NAMES: Readonly<Record<string, string>> = {
  "openai/gpt-5.5": "GPT-5.5",
  "anthropic/claude-opus-4.8": "Claude Opus 4.8",
  "z-ai/glm-5.2": "GLM 5.2",
  "google/gemini-3.5-flash": "Gemini 3.5 Flash",
  "qwen/qwen3.7-max": "Qwen3.7 Max",
  "x-ai/grok-4.3": "Grok 4.3",
  "anthropic/claude-sonnet-4.6": "Claude Sonnet 4.6",
  "deepseek/deepseek-v4-pro": "DeepSeek V4 Pro",
  "z-ai/glm-5.1": "GLM 5.1",
  "qwen/qwen3.6-plus": "Qwen3.6 Plus",
  "google/gemini-3-flash-preview": "Gemini 3 Flash Preview",
  "mistralai/mistral-medium-3-5": "Mistral Medium 3.5",
  "qwen/qwen3.6-max-preview": "Qwen3.6 Max Preview",
  "qwen/qwen3.6-35b-a3b": "Qwen3.6 35B A3B",
  "google/gemini-3.1-flash-lite": "Gemini 3.1 Flash Lite",
  "openai/gpt-5-mini": "GPT-5 Mini",
  "deepseek/deepseek-v4-flash": "DeepSeek V4 Flash",
  "openai/gpt-5-nano": "GPT-5 Nano",
  "mistralai/mistral-small-2603": "Mistral Small 2603",
  "minimax/minimax-m2.7": "MiniMax M2.7",
};

export type BuiltInCouncilTemplate = Readonly<{
  slug: BuiltInCouncilSlug;
  name: string;
  description: string;
  phasePrompts: PhasePrompts;
  members: CouncilMembers;
}>;

const BASE_TUNING = {
  temperature: null,
  topP: null,
  seed: null,
  verbosity: "low",
  reasoningEffort: null,
  includeReasoning: null,
} as const satisfies CouncilMemberTuning;

const SYNTHESIZER_TUNING = {
  ...BASE_TUNING,
  verbosity: "max",
  reasoningEffort: "xhigh",
} as const satisfies CouncilMemberTuning;

const COMMONS_REVIEWER_TUNING = {
  ...BASE_TUNING,
  reasoningEffort: "low",
} as const satisfies CouncilMemberTuning;

const LANTERN_REVIEWER_TUNING = {
  ...BASE_TUNING,
  reasoningEffort: "medium",
} as const satisfies CouncilMemberTuning;

const FOUNDING_REVIEWER_TUNING = {
  ...BASE_TUNING,
  reasoningEffort: "xhigh",
} as const satisfies CouncilMemberTuning;

function buildCouncilMembers(
  models: Record<MemberPosition, ProviderModelRef>,
  reviewerTuning: CouncilMemberTuning,
): CouncilMembers {
  return parseCouncilMembers(
    MEMBER_POSITIONS.map((memberPosition) => ({
      memberPosition,
      model: models[memberPosition],
      tuning: memberPosition === 7 ? SYNTHESIZER_TUNING : reviewerTuning,
    })),
  );
}

export const BUILT_IN_COUNCILS: Readonly<Record<BuiltInCouncilSlug, BuiltInCouncilTemplate>> = {
  founding: {
    slug: "founding",
    name: "The Founding Council",
    description: "Strongest built-in council. GPT-5.5 writes the final answer.",
    phasePrompts: DEFAULT_PHASE_PROMPTS,
    members: buildCouncilMembers(
      {
        1: { provider: "openrouter", modelId: FOUNDING_COUNCIL_MODEL_IDS[1] },
        2: { provider: "openrouter", modelId: FOUNDING_COUNCIL_MODEL_IDS[2] },
        3: { provider: "openrouter", modelId: FOUNDING_COUNCIL_MODEL_IDS[3] },
        4: { provider: "openrouter", modelId: FOUNDING_COUNCIL_MODEL_IDS[4] },
        5: { provider: "openrouter", modelId: FOUNDING_COUNCIL_MODEL_IDS[5] },
        6: { provider: "openrouter", modelId: FOUNDING_COUNCIL_MODEL_IDS[6] },
        7: { provider: "openrouter", modelId: FOUNDING_COUNCIL_MODEL_IDS[7] },
      },
      FOUNDING_REVIEWER_TUNING,
    ),
  },
  lantern: {
    slug: "lantern",
    name: "The Lantern Council",
    description: "Balanced mid-tier council. Qwen3.6 Max Preview writes the final answer.",
    phasePrompts: DEFAULT_PHASE_PROMPTS,
    members: buildCouncilMembers(
      {
        1: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[1] },
        2: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[2] },
        3: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[3] },
        4: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[4] },
        5: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[5] },
        6: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[6] },
        7: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[7] },
      },
      LANTERN_REVIEWER_TUNING,
    ),
  },
  commons: {
    slug: "commons",
    name: "The Commons Council",
    description: "Low-cost demo council. MiniMax M2.7 writes the final answer.",
    phasePrompts: DEFAULT_PHASE_PROMPTS,
    members: buildCouncilMembers(
      {
        1: { provider: "openrouter", modelId: COMMONS_COUNCIL_MODEL_IDS[1] },
        2: { provider: "openrouter", modelId: COMMONS_COUNCIL_MODEL_IDS[2] },
        3: { provider: "openrouter", modelId: COMMONS_COUNCIL_MODEL_IDS[3] },
        4: { provider: "openrouter", modelId: COMMONS_COUNCIL_MODEL_IDS[4] },
        5: { provider: "openrouter", modelId: COMMONS_COUNCIL_MODEL_IDS[5] },
        6: { provider: "openrouter", modelId: COMMONS_COUNCIL_MODEL_IDS[6] },
        7: { provider: "openrouter", modelId: COMMONS_COUNCIL_MODEL_IDS[7] },
      },
      COMMONS_REVIEWER_TUNING,
    ),
  },
};

export const BUILT_IN_MODEL_SEEDS: ReadonlyArray<ProviderModelSeed> = Object.values(
  BUILT_IN_COUNCILS,
).flatMap((council) =>
  council.members.map((member) => ({
    modelId: member.model.modelId,
    modelName: BUILT_IN_MODEL_NAMES[member.model.modelId] ?? member.model.modelId,
  })),
);
