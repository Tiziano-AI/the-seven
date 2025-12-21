import type { MemberPosition } from "../../shared/domain/sevenMembers";
import type { ProviderModelRef } from "../../shared/domain/providerModels";
import type { BuiltInCouncilSlug } from "../../shared/domain/builtInCouncils";
import { DEFAULT_MEMBER_MODELS, type ProviderModelSeed } from "./defaultMemberModels";

export type { BuiltInCouncilSlug } from "../../shared/domain/builtInCouncils";

export type BuiltInCouncilTemplate = Readonly<{
  slug: BuiltInCouncilSlug;
  name: string;
  description: string;
  members: Record<MemberPosition, ProviderModelRef>;
}>;

const LANTERN_COUNCIL_MODEL_IDS: Record<MemberPosition, string> = {
  1: "amazon/nova-2-lite-v1",
  2: "x-ai/grok-4.1-fast",
  3: "moonshotai/kimi-k2-thinking",
  4: "openai/gpt-5.1-codex-mini",
  5: "qwen/qwen3-vl-8b-thinking",
  6: "mistralai/mistral-large-2512",
  7: "google/gemini-3-flash-preview",
};

export const BUILT_IN_COUNCILS: Readonly<Record<BuiltInCouncilSlug, BuiltInCouncilTemplate>> = {
  founding: {
    slug: "founding",
    name: "The Founding Council",
    description: "The default seven voices: replies, critique, verdict.",
    members: {
      1: { provider: "openrouter", modelId: DEFAULT_MEMBER_MODELS[1].modelId },
      2: { provider: "openrouter", modelId: DEFAULT_MEMBER_MODELS[2].modelId },
      3: { provider: "openrouter", modelId: DEFAULT_MEMBER_MODELS[3].modelId },
      4: { provider: "openrouter", modelId: DEFAULT_MEMBER_MODELS[4].modelId },
      5: { provider: "openrouter", modelId: DEFAULT_MEMBER_MODELS[5].modelId },
      6: { provider: "openrouter", modelId: DEFAULT_MEMBER_MODELS[6].modelId },
      7: { provider: "openrouter", modelId: DEFAULT_MEMBER_MODELS[7].modelId },
    },
  },
  lantern: {
    slug: "lantern",
    name: "The Lantern Council",
    description: "A lean lineup for rapid iteration. Gemini 3 Flash delivers the verdict.",
    members: {
      1: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[1] },
      2: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[2] },
      3: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[3] },
      4: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[4] },
      5: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[5] },
      6: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[6] },
      7: { provider: "openrouter", modelId: LANTERN_COUNCIL_MODEL_IDS[7] },
    },
  },
};

function dedupeSeeds(seeds: ReadonlyArray<ProviderModelSeed>): ProviderModelSeed[] {
  const seen = new Set<string>();
  const unique: ProviderModelSeed[] = [];
  for (const seed of seeds) {
    if (seen.has(seed.modelId)) continue;
    seen.add(seed.modelId);
    unique.push(seed);
  }
  return unique;
}

export const BUILT_IN_MODEL_SEEDS: ReadonlyArray<ProviderModelSeed> = dedupeSeeds([
  // Founding council
  DEFAULT_MEMBER_MODELS[1],
  DEFAULT_MEMBER_MODELS[2],
  DEFAULT_MEMBER_MODELS[3],
  DEFAULT_MEMBER_MODELS[4],
  DEFAULT_MEMBER_MODELS[5],
  DEFAULT_MEMBER_MODELS[6],
  DEFAULT_MEMBER_MODELS[7],

  // Lantern council (modelName is best-effort until OpenRouter catalog refreshes)
  { modelId: LANTERN_COUNCIL_MODEL_IDS[1], modelName: LANTERN_COUNCIL_MODEL_IDS[1] },
  { modelId: LANTERN_COUNCIL_MODEL_IDS[2], modelName: LANTERN_COUNCIL_MODEL_IDS[2] },
  { modelId: LANTERN_COUNCIL_MODEL_IDS[3], modelName: LANTERN_COUNCIL_MODEL_IDS[3] },
  { modelId: LANTERN_COUNCIL_MODEL_IDS[4], modelName: LANTERN_COUNCIL_MODEL_IDS[4] },
  { modelId: LANTERN_COUNCIL_MODEL_IDS[5], modelName: LANTERN_COUNCIL_MODEL_IDS[5] },
  { modelId: LANTERN_COUNCIL_MODEL_IDS[6], modelName: LANTERN_COUNCIL_MODEL_IDS[6] },
  { modelId: LANTERN_COUNCIL_MODEL_IDS[7], modelName: LANTERN_COUNCIL_MODEL_IDS[7] },
]);
