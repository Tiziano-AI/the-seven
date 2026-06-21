import type { BuiltInCouncilSlug, CouncilMemberTuning } from "@the-seven/contracts";
import { MEMBER_POSITIONS } from "@the-seven/contracts";
import { describe, expect, test } from "vitest";
import { BUILT_IN_COUNCILS } from "./builtInCouncils";

type CatalogFixture = Readonly<{
  promptUsdPerMillion: number;
  completionUsdPerMillion: number;
  expirationDate: string | null;
  contextLength: number;
  maxCompletionTokens: number | null;
  supportedParameters: readonly string[];
}>;

const CORE_PARAMETERS = [
  "include_reasoning",
  "max_tokens",
  "reasoning",
  "response_format",
  "structured_outputs",
] as const;
const COMMON_EXTRAS = ["seed", "stop", "temperature", "tool_choice", "tools", "top_p"] as const;
const FULL_EXTRAS = [
  "frequency_penalty",
  "logit_bias",
  "logprobs",
  "min_p",
  "presence_penalty",
  "repetition_penalty",
  "top_k",
  "top_logprobs",
] as const;

function supportedParameters(extras: readonly string[]): readonly string[] {
  return [...CORE_PARAMETERS, ...extras].sort((left, right) => left.localeCompare(right));
}

const SUPPORTS_OPENAI = supportedParameters([
  "max_completion_tokens",
  "seed",
  "tool_choice",
  "tools",
]);
const SUPPORTS_ANTHROPIC_OPUS = supportedParameters(["stop", "tool_choice", "tools", "verbosity"]);
const SUPPORTS_ANTHROPIC_SONNET = supportedParameters([
  "max_completion_tokens",
  "stop",
  "temperature",
  "tool_choice",
  "tools",
  "top_k",
  "top_p",
  "verbosity",
]);
const SUPPORTS_FULL = supportedParameters([...COMMON_EXTRAS, ...FULL_EXTRAS]);
const SUPPORTS_FULL_NO_LOGPROBS = supportedParameters([
  ...COMMON_EXTRAS,
  ...FULL_EXTRAS.filter((parameter) => parameter !== "logprobs" && parameter !== "top_logprobs"),
]);
const SUPPORTS_GOOGLE = supportedParameters(COMMON_EXTRAS);
const SUPPORTS_GROK = supportedParameters([
  "frequency_penalty",
  "logprobs",
  "presence_penalty",
  ...COMMON_EXTRAS,
  "top_logprobs",
]);
const SUPPORTS_KIMI = supportedParameters([
  ...COMMON_EXTRAS,
  ...FULL_EXTRAS,
  "parallel_tool_calls",
  "reasoning_effort",
]);
const SUPPORTS_MISTRAL = supportedParameters([
  "frequency_penalty",
  "presence_penalty",
  ...COMMON_EXTRAS,
]);
const SUPPORTS_MISTRAL_SMALL = supportedParameters([
  "frequency_penalty",
  "presence_penalty",
  ...COMMON_EXTRAS,
  "top_k",
]);
const SUPPORTS_QWEN = supportedParameters([
  "presence_penalty",
  "seed",
  "temperature",
  "tool_choice",
  "tools",
  "top_p",
]);
const SUPPORTS_QWEN_MAX = supportedParameters([
  "logprobs",
  "presence_penalty",
  "seed",
  "temperature",
  "tool_choice",
  "tools",
  "top_logprobs",
  "top_p",
]);

const OPENROUTER_CATALOG_2026_06_21: Readonly<Record<string, CatalogFixture>> = {
  "anthropic/claude-opus-4.8": {
    promptUsdPerMillion: 5,
    completionUsdPerMillion: 25,
    expirationDate: null,
    contextLength: 1_000_000,
    maxCompletionTokens: 128_000,
    supportedParameters: SUPPORTS_ANTHROPIC_OPUS,
  },
  "anthropic/claude-sonnet-4.6": {
    promptUsdPerMillion: 3,
    completionUsdPerMillion: 15,
    expirationDate: null,
    contextLength: 1_000_000,
    maxCompletionTokens: 128_000,
    supportedParameters: SUPPORTS_ANTHROPIC_SONNET,
  },
  "deepseek/deepseek-v4-flash": {
    promptUsdPerMillion: 0.112,
    completionUsdPerMillion: 0.224,
    expirationDate: null,
    contextLength: 1_048_576,
    maxCompletionTokens: null,
    supportedParameters: SUPPORTS_FULL,
  },
  "deepseek/deepseek-v4-pro": {
    promptUsdPerMillion: 0.435,
    completionUsdPerMillion: 0.87,
    expirationDate: null,
    contextLength: 1_048_576,
    maxCompletionTokens: 384_000,
    supportedParameters: SUPPORTS_FULL,
  },
  "google/gemini-3-flash-preview": {
    promptUsdPerMillion: 0.5,
    completionUsdPerMillion: 3,
    expirationDate: null,
    contextLength: 1_048_576,
    maxCompletionTokens: 65_536,
    supportedParameters: SUPPORTS_GOOGLE,
  },
  "google/gemini-3.1-flash-lite": {
    promptUsdPerMillion: 0.25,
    completionUsdPerMillion: 1.5,
    expirationDate: null,
    contextLength: 1_048_576,
    maxCompletionTokens: 65_536,
    supportedParameters: SUPPORTS_GOOGLE,
  },
  "google/gemini-3.5-flash": {
    promptUsdPerMillion: 1.5,
    completionUsdPerMillion: 9,
    expirationDate: null,
    contextLength: 1_048_576,
    maxCompletionTokens: 65_536,
    supportedParameters: SUPPORTS_GOOGLE,
  },
  "minimax/minimax-m2.7": {
    promptUsdPerMillion: 0.279,
    completionUsdPerMillion: 1.2,
    expirationDate: null,
    contextLength: 204_800,
    maxCompletionTokens: 131_072,
    supportedParameters: SUPPORTS_FULL,
  },
  "mistralai/mistral-medium-3-5": {
    promptUsdPerMillion: 1.5,
    completionUsdPerMillion: 7.5,
    expirationDate: null,
    contextLength: 262_144,
    maxCompletionTokens: null,
    supportedParameters: SUPPORTS_MISTRAL,
  },
  "mistralai/mistral-small-2603": {
    promptUsdPerMillion: 0.15,
    completionUsdPerMillion: 0.6,
    expirationDate: null,
    contextLength: 262_144,
    maxCompletionTokens: null,
    supportedParameters: SUPPORTS_MISTRAL_SMALL,
  },
  "openai/gpt-5.5": {
    promptUsdPerMillion: 5,
    completionUsdPerMillion: 30,
    expirationDate: null,
    contextLength: 1_050_000,
    maxCompletionTokens: 128_000,
    supportedParameters: SUPPORTS_OPENAI,
  },
  "openai/gpt-5-mini": {
    promptUsdPerMillion: 0.25,
    completionUsdPerMillion: 2,
    expirationDate: null,
    contextLength: 400_000,
    maxCompletionTokens: 128_000,
    supportedParameters: SUPPORTS_OPENAI,
  },
  "openai/gpt-5-nano": {
    promptUsdPerMillion: 0.05,
    completionUsdPerMillion: 0.4,
    expirationDate: null,
    contextLength: 400_000,
    maxCompletionTokens: null,
    supportedParameters: SUPPORTS_OPENAI,
  },
  "qwen/qwen3.6-35b-a3b": {
    promptUsdPerMillion: 0.15,
    completionUsdPerMillion: 1,
    expirationDate: null,
    contextLength: 262_144,
    maxCompletionTokens: 262_144,
    supportedParameters: SUPPORTS_FULL_NO_LOGPROBS,
  },
  "qwen/qwen3.6-max-preview": {
    promptUsdPerMillion: 1.04,
    completionUsdPerMillion: 6.24,
    expirationDate: null,
    contextLength: 262_144,
    maxCompletionTokens: 65_536,
    supportedParameters: SUPPORTS_QWEN_MAX,
  },
  "x-ai/grok-4.3": {
    promptUsdPerMillion: 1.25,
    completionUsdPerMillion: 2.5,
    expirationDate: null,
    contextLength: 1_000_000,
    maxCompletionTokens: null,
    supportedParameters: SUPPORTS_GROK,
  },
  "qwen/qwen3.6-plus": {
    promptUsdPerMillion: 0.325,
    completionUsdPerMillion: 1.95,
    expirationDate: null,
    contextLength: 1_000_000,
    maxCompletionTokens: 65_536,
    supportedParameters: SUPPORTS_QWEN,
  },
  "z-ai/glm-5.1": {
    promptUsdPerMillion: 0.98,
    completionUsdPerMillion: 3.08,
    expirationDate: null,
    contextLength: 202_752,
    maxCompletionTokens: null,
    supportedParameters: SUPPORTS_KIMI,
  },
  "qwen/qwen3.7-max": {
    promptUsdPerMillion: 1.25,
    completionUsdPerMillion: 3.75,
    expirationDate: null,
    contextLength: 1_000_000,
    maxCompletionTokens: 65_536,
    supportedParameters: SUPPORTS_QWEN_MAX,
  },
  "z-ai/glm-5.2": {
    promptUsdPerMillion: 1.2,
    completionUsdPerMillion: 4.1,
    expirationDate: null,
    contextLength: 1_048_576,
    maxCompletionTokens: 131_072,
    supportedParameters: SUPPORTS_FULL,
  },
};

const EXPECTED_ROSTERS = {
  commons: [
    "qwen/qwen3.6-35b-a3b",
    "google/gemini-3.1-flash-lite",
    "openai/gpt-5-mini",
    "deepseek/deepseek-v4-flash",
    "openai/gpt-5-nano",
    "mistralai/mistral-small-2603",
    "minimax/minimax-m2.7",
  ],
  founding: [
    "openai/gpt-5.5",
    "anthropic/claude-opus-4.8",
    "z-ai/glm-5.2",
    "google/gemini-3.5-flash",
    "qwen/qwen3.7-max",
    "x-ai/grok-4.3",
    "openai/gpt-5.5",
  ],
  lantern: [
    "anthropic/claude-sonnet-4.6",
    "deepseek/deepseek-v4-pro",
    "z-ai/glm-5.1",
    "qwen/qwen3.6-plus",
    "google/gemini-3-flash-preview",
    "mistralai/mistral-medium-3-5",
    "qwen/qwen3.6-max-preview",
  ],
} satisfies Record<BuiltInCouncilSlug, readonly string[]>;

const SYNTHESIZERS = {
  commons: "minimax/minimax-m2.7",
  founding: "openai/gpt-5.5",
  lantern: "qwen/qwen3.6-max-preview",
} satisfies Record<BuiltInCouncilSlug, string>;

const EXPECTED_REVIEWER_REASONING_EFFORTS = {
  commons: "low",
  founding: "xhigh",
  lantern: "medium",
} satisfies Record<BuiltInCouncilSlug, NonNullable<CouncilMemberTuning["reasoningEffort"]>>;

const EXPECTED_SYNTHESIZER_REASONING_EFFORT = "xhigh";

const RETIRED_ACTIVE_MODEL_IDS = [
  "openai/gpt-5.4-mini",
  "openai/gpt-5.4-nano",
  "x-ai/grok-4.20",
  "x-ai/grok-4.20-multi-agent",
  "x-ai/grok-4.1-fast",
  "deepseek/deepseek-v3.2",
  "google/gemini-2.5-flash",
  "qwen/qwen3.5-35b-a3b",
  "openai/gpt-oss-120b",
  "arcee-ai/trinity-mini",
  "google/gemma-4-31b-it",
  "qwen/qwen3.6-27b",
  "qwen/qwen3.6-flash",
  "bytedance-seed/seed-2.0-lite",
] as const;

function modelIds(slug: BuiltInCouncilSlug): string[] {
  return BUILT_IN_COUNCILS[slug].members.map((member) => member.model.modelId);
}

function strictDefaultParameters(tuning: CouncilMemberTuning): string[] {
  const parameters: string[] = [];
  if (typeof tuning.temperature === "number") parameters.push("temperature");
  if (typeof tuning.topP === "number") parameters.push("top_p");
  if (typeof tuning.seed === "number") parameters.push("seed");
  if (typeof tuning.includeReasoning === "boolean") parameters.push("include_reasoning");
  if (tuning.reasoningEffort) parameters.push("reasoning");
  return parameters;
}

function blendedUsdPerMillion(catalogRow: CatalogFixture): number {
  return (3 * catalogRow.promptUsdPerMillion + catalogRow.completionUsdPerMillion) / 4;
}

describe("built-in council rosters", () => {
  test("declare the canonical tier rosters", () => {
    expect(modelIds("founding")).toEqual(EXPECTED_ROSTERS.founding);
    expect(modelIds("lantern")).toEqual(EXPECTED_ROSTERS.lantern);
    expect(modelIds("commons")).toEqual(EXPECTED_ROSTERS.commons);
  });

  test("catalog fixture covers the active OpenRouter built-in set", () => {
    const activeIds = Object.values(BUILT_IN_COUNCILS).flatMap((council) =>
      council.members.map((member) => member.model.modelId),
    );
    const uniqueActiveIds = new Set(activeIds);

    expect(Object.keys(OPENROUTER_CATALOG_2026_06_21).sort()).toEqual([...uniqueActiveIds].sort());
    expect(uniqueActiveIds.size).toBe(20);
    expect(activeIds).toHaveLength(21);
  });

  test("active built-ins do not use retired launch-candidate rows", () => {
    const activeIds = Object.values(BUILT_IN_COUNCILS).flatMap((council) =>
      council.members.map((member) => member.model.modelId),
    );

    for (const retiredId of RETIRED_ACTIVE_MODEL_IDS) {
      expect(activeIds).not.toContain(retiredId);
    }
  });

  test("Commons is the paid low-cost demo roster", () => {
    const ceiling = blendedUsdPerMillion(OPENROUTER_CATALOG_2026_06_21["openai/gpt-5-mini"]);

    for (const modelId of modelIds("commons")) {
      const catalogRow = OPENROUTER_CATALOG_2026_06_21[modelId];

      expect(catalogRow.promptUsdPerMillion).toBeGreaterThan(0);
      expect(catalogRow.completionUsdPerMillion).toBeGreaterThan(0);
      expect(blendedUsdPerMillion(catalogRow)).toBeLessThanOrEqual(ceiling);
      expect(catalogRow.expirationDate).toBeNull();
      expect(modelId.startsWith("~")).toBe(false);
      expect(modelId.includes(":free")).toBe(false);
      expect(modelId.includes("preview")).toBe(false);
    }
  });

  test("catalog rows expose context and phase output metadata", () => {
    for (const council of Object.values(BUILT_IN_COUNCILS)) {
      for (const member of council.members) {
        const catalogRow = OPENROUTER_CATALOG_2026_06_21[member.model.modelId];

        expect(catalogRow.contextLength).toBeGreaterThanOrEqual(131_072);
        expect(catalogRow.expirationDate).toBeNull();
        if (typeof catalogRow.maxCompletionTokens === "number") {
          expect(catalogRow.maxCompletionTokens).toBeGreaterThanOrEqual(64_000);
        }
      }
    }
  });

  test("built-in hard tuning defaults only require catalog-supported parameters", () => {
    for (const council of Object.values(BUILT_IN_COUNCILS)) {
      for (const member of council.members) {
        const catalogRow = OPENROUTER_CATALOG_2026_06_21[member.model.modelId];
        const supported = new Set(catalogRow.supportedParameters);

        expect(member.tuning).not.toBeNull();
        if (member.tuning === null) {
          throw new Error(`Built-in member ${member.model.modelId} has no tuning defaults.`);
        }

        for (const parameter of strictDefaultParameters(member.tuning)) {
          expect(supported.has(parameter)).toBe(true);
        }
      }
    }
  });

  test("built-ins use reviewer defaults plus high-effort final synthesizers", () => {
    for (const council of Object.values(BUILT_IN_COUNCILS)) {
      for (const member of council.members) {
        expect(member.tuning).not.toBeNull();
        if (member.tuning === null) {
          throw new Error(`Built-in member ${member.model.modelId} has no tuning defaults.`);
        }

        const isSynthesizer = member.memberPosition === 7;
        expect(member.tuning.reasoningEffort).toBe(
          isSynthesizer
            ? EXPECTED_SYNTHESIZER_REASONING_EFFORT
            : EXPECTED_REVIEWER_REASONING_EFFORTS[council.slug],
        );
        expect(member.tuning.temperature).toBeNull();
        expect(member.tuning.topP).toBeNull();
        expect(member.tuning.seed).toBeNull();
        expect(member.tuning.verbosity).toBe(isSynthesizer ? "max" : "low");
        expect(member.tuning.includeReasoning).toBeNull();
      }
    }
  });

  test("position 7 is the tier synthesizer and final-answer policy seat", () => {
    for (const council of Object.values(BUILT_IN_COUNCILS)) {
      const expectedSynthesizer = SYNTHESIZERS[council.slug];

      expect(council.members.map((member) => member.memberPosition)).toEqual(MEMBER_POSITIONS);
      expect(council.members[6]?.model.modelId).toBe(expectedSynthesizer);
      expect(council.description.toLowerCase()).toContain("writes the final answer");
    }
  });

  test("phase rows expose required OpenRouter capability parameters", () => {
    for (const council of Object.values(BUILT_IN_COUNCILS)) {
      for (const member of council.members) {
        const catalogRow = OPENROUTER_CATALOG_2026_06_21[member.model.modelId];

        expect(catalogRow.supportedParameters).toContain("reasoning");
        expect(catalogRow.supportedParameters).toContain("max_tokens");
        expect(catalogRow.supportedParameters).toContain("response_format");
        expect(catalogRow.supportedParameters).toContain("structured_outputs");
      }
    }
  });
});
