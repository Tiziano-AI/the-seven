import type { BuiltInCouncilSlug, CouncilMemberTuning } from "@the-seven/contracts";
import { describe, expect, test } from "vitest";
import { BUILT_IN_COUNCILS } from "./builtInCouncils";

type CatalogFixture = Readonly<{
  promptUsdPerMillion: number;
  completionUsdPerMillion: number;
  supportedParameters: readonly string[];
}>;

const SUPPORTS_FULL_DEFAULT = ["temperature", "top_p", "reasoning", "seed"] as const;
const SUPPORTS_OPENAI_DEFAULT = ["reasoning", "seed"] as const;
const SUPPORTS_OPUS_DEFAULT = ["reasoning"] as const;

const OPENROUTER_CATALOG_2026_05_10: Record<string, CatalogFixture> = {
  "anthropic/claude-opus-4.7": {
    promptUsdPerMillion: 5,
    completionUsdPerMillion: 25,
    supportedParameters: SUPPORTS_OPUS_DEFAULT,
  },
  "anthropic/claude-sonnet-4.6": {
    promptUsdPerMillion: 3,
    completionUsdPerMillion: 15,
    supportedParameters: SUPPORTS_FULL_DEFAULT,
  },
  "deepseek/deepseek-v4-flash": {
    promptUsdPerMillion: 0.14,
    completionUsdPerMillion: 0.28,
    supportedParameters: SUPPORTS_FULL_DEFAULT,
  },
  "deepseek/deepseek-v4-pro": {
    promptUsdPerMillion: 0.435,
    completionUsdPerMillion: 0.87,
    supportedParameters: SUPPORTS_FULL_DEFAULT,
  },
  "google/gemini-3.1-flash-lite": {
    promptUsdPerMillion: 0.25,
    completionUsdPerMillion: 1.5,
    supportedParameters: SUPPORTS_FULL_DEFAULT,
  },
  "google/gemini-3.1-pro-preview": {
    promptUsdPerMillion: 2,
    completionUsdPerMillion: 12,
    supportedParameters: SUPPORTS_FULL_DEFAULT,
  },
  "minimax/minimax-m2.7": {
    promptUsdPerMillion: 0.299,
    completionUsdPerMillion: 1.2,
    supportedParameters: SUPPORTS_FULL_DEFAULT,
  },
  "mistralai/mistral-medium-3-5": {
    promptUsdPerMillion: 1.5,
    completionUsdPerMillion: 7.5,
    supportedParameters: SUPPORTS_FULL_DEFAULT,
  },
  "mistralai/mistral-small-2603": {
    promptUsdPerMillion: 0.15,
    completionUsdPerMillion: 0.6,
    supportedParameters: SUPPORTS_FULL_DEFAULT,
  },
  "moonshotai/kimi-k2.6": {
    promptUsdPerMillion: 0.75,
    completionUsdPerMillion: 3.5,
    supportedParameters: SUPPORTS_FULL_DEFAULT,
  },
  "openai/gpt-5.4-nano": {
    promptUsdPerMillion: 0.2,
    completionUsdPerMillion: 1.25,
    supportedParameters: SUPPORTS_OPENAI_DEFAULT,
  },
  "openai/gpt-5.5-pro": {
    promptUsdPerMillion: 30,
    completionUsdPerMillion: 180,
    supportedParameters: SUPPORTS_OPENAI_DEFAULT,
  },
  "qwen/qwen3.6-35b-a3b": {
    promptUsdPerMillion: 0.15,
    completionUsdPerMillion: 1,
    supportedParameters: SUPPORTS_FULL_DEFAULT,
  },
  "qwen/qwen3.6-plus": {
    promptUsdPerMillion: 0.325,
    completionUsdPerMillion: 1.95,
    supportedParameters: SUPPORTS_FULL_DEFAULT,
  },
  "x-ai/grok-4.3": {
    promptUsdPerMillion: 1.25,
    completionUsdPerMillion: 2.5,
    supportedParameters: SUPPORTS_FULL_DEFAULT,
  },
  "xiaomi/mimo-v2.5": {
    promptUsdPerMillion: 0.4,
    completionUsdPerMillion: 2,
    supportedParameters: ["temperature", "top_p", "reasoning"],
  },
  "xiaomi/mimo-v2.5-pro": {
    promptUsdPerMillion: 1,
    completionUsdPerMillion: 3,
    supportedParameters: SUPPORTS_FULL_DEFAULT,
  },
  "z-ai/glm-5.1": {
    promptUsdPerMillion: 1.05,
    completionUsdPerMillion: 3.5,
    supportedParameters: SUPPORTS_FULL_DEFAULT,
  },
  "z-ai/glm-4.7-flash": {
    promptUsdPerMillion: 0.06,
    completionUsdPerMillion: 0.4,
    supportedParameters: SUPPORTS_FULL_DEFAULT,
  },
};

const EXPECTED_ROSTERS = {
  commons: [
    "google/gemini-3.1-flash-lite",
    "deepseek/deepseek-v4-flash",
    "qwen/qwen3.6-35b-a3b",
    "minimax/minimax-m2.7",
    "mistralai/mistral-small-2603",
    "z-ai/glm-4.7-flash",
    "openai/gpt-5.4-nano",
  ],
  founding: [
    "google/gemini-3.1-pro-preview",
    "anthropic/claude-opus-4.7",
    "x-ai/grok-4.3",
    "deepseek/deepseek-v4-pro",
    "xiaomi/mimo-v2.5-pro",
    "moonshotai/kimi-k2.6",
    "openai/gpt-5.5-pro",
  ],
  lantern: [
    "deepseek/deepseek-v4-pro",
    "qwen/qwen3.6-plus",
    "xiaomi/mimo-v2.5",
    "minimax/minimax-m2.7",
    "z-ai/glm-5.1",
    "mistralai/mistral-medium-3-5",
    "anthropic/claude-sonnet-4.6",
  ],
} satisfies Record<BuiltInCouncilSlug, readonly string[]>;

function modelIds(slug: BuiltInCouncilSlug): string[] {
  return BUILT_IN_COUNCILS[slug].members.map((member) => member.model.modelId);
}

function sentDefaultParameters(tuning: CouncilMemberTuning): string[] {
  const parameters: string[] = [];
  if (typeof tuning.temperature === "number") parameters.push("temperature");
  if (typeof tuning.topP === "number") parameters.push("top_p");
  if (typeof tuning.seed === "number") parameters.push("seed");
  if (tuning.verbosity) parameters.push("verbosity");
  if (typeof tuning.includeReasoning === "boolean") parameters.push("include_reasoning");
  if (tuning.reasoningEffort) parameters.push("reasoning");
  return parameters;
}

describe("built-in council rosters", () => {
  test("declare the canonical tier rosters", () => {
    expect(modelIds("founding")).toEqual(EXPECTED_ROSTERS.founding);
    expect(modelIds("lantern")).toEqual(EXPECTED_ROSTERS.lantern);
    expect(modelIds("commons")).toEqual(EXPECTED_ROSTERS.commons);
  });

  test("all built-in models exist in the current OpenRouter catalog fixture", () => {
    for (const council of Object.values(BUILT_IN_COUNCILS)) {
      for (const member of council.members) {
        expect(OPENROUTER_CATALOG_2026_05_10[member.model.modelId]).toBeDefined();
      }
    }
  });

  test("Commons is the paid low-cost demo roster", () => {
    for (const modelId of modelIds("commons")) {
      const catalogRow = OPENROUTER_CATALOG_2026_05_10[modelId];
      expect(catalogRow.promptUsdPerMillion).toBeGreaterThan(0);
      expect(catalogRow.completionUsdPerMillion).toBeGreaterThan(0);
      expect(catalogRow.promptUsdPerMillion).toBeLessThanOrEqual(0.299);
      expect(catalogRow.completionUsdPerMillion).toBeLessThanOrEqual(1.5);
      expect(modelId.startsWith("~")).toBe(false);
      expect(modelId.includes(":free")).toBe(false);
    }
  });

  test("built-in tuning defaults only send catalog-supported parameters", () => {
    for (const council of Object.values(BUILT_IN_COUNCILS)) {
      for (const member of council.members) {
        const catalogRow = OPENROUTER_CATALOG_2026_05_10[member.model.modelId];
        const supported = new Set(catalogRow.supportedParameters);

        expect(member.tuning).not.toBeNull();
        if (member.tuning === null) {
          throw new Error(`Built-in member ${member.model.modelId} has no tuning defaults.`);
        }

        for (const parameter of sentDefaultParameters(member.tuning)) {
          expect(supported.has(parameter)).toBe(true);
        }
      }
    }
  });
});
