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
  2: "anthropic/claude-opus-4.7",
  3: "google/gemini-3.1-pro-preview",
  4: "moonshotai/kimi-k2.6",
  5: "xiaomi/mimo-v2.5-pro",
  6: "x-ai/grok-4.3",
  7: "openai/gpt-5.5-pro",
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
  1: "qwen/qwen3.6-flash",
  2: "google/gemini-3.1-flash-lite",
  3: "openai/gpt-5-mini",
  4: "deepseek/deepseek-v4-flash",
  5: "openai/gpt-5-nano",
  6: "mistralai/mistral-small-2603",
  7: "minimax/minimax-m2.7",
};

export type BuiltInCouncilTemplate = Readonly<{
  slug: BuiltInCouncilSlug;
  name: string;
  description: string;
  phasePrompts: PhasePrompts;
  members: CouncilMembers;
}>;

const FULL_DEFAULT_TUNING = {
  temperature: null,
  topP: null,
  seed: null,
  verbosity: null,
  reasoningEffort: "xhigh",
  includeReasoning: null,
} as const satisfies CouncilMemberTuning;

const COMMONS_DEFAULT_TUNING = {
  ...FULL_DEFAULT_TUNING,
  reasoningEffort: "low",
} as const satisfies CouncilMemberTuning;

const LANTERN_DEFAULT_TUNING = {
  ...FULL_DEFAULT_TUNING,
  reasoningEffort: "medium",
} as const satisfies CouncilMemberTuning;

function buildCouncilMembers(
  models: Record<MemberPosition, ProviderModelRef>,
  baseTuning: CouncilMemberTuning,
): CouncilMembers {
  return parseCouncilMembers(
    MEMBER_POSITIONS.map((memberPosition) => ({
      memberPosition,
      model: models[memberPosition],
      tuning: baseTuning,
    })),
  );
}

export const BUILT_IN_COUNCILS: Readonly<Record<BuiltInCouncilSlug, BuiltInCouncilTemplate>> = {
  founding: {
    slug: "founding",
    name: "The Founding Council",
    description: "The BYOK best-of-best roster. GPT-5.5 Pro delivers the verdict.",
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
      FULL_DEFAULT_TUNING,
    ),
  },
  lantern: {
    slug: "lantern",
    name: "The Lantern Council",
    description: "Deliberate mid-tier bridge voices. Qwen3.6 Max Preview delivers the verdict.",
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
      LANTERN_DEFAULT_TUNING,
    ),
  },
  commons: {
    slug: "commons",
    name: "The Commons Council",
    description: "Paid low-cost demo voices. MiniMax M2.7 delivers the verdict.",
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
      COMMONS_DEFAULT_TUNING,
    ),
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
