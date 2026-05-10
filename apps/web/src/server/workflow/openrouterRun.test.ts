import { describe, expect, test, vi } from "vitest";

const adapterMocks = vi.hoisted(() => ({
  callOpenRouter: vi.fn(),
  fetchOpenRouterGeneration: vi.fn(),
}));
const dbMocks = vi.hoisted(() => ({
  createProviderCall: vi.fn(),
  listProviderCalls: vi.fn(),
  refreshSessionUsageTotals: vi.fn(),
  updateProviderCallCost: vi.fn(),
}));
const modelMocks = vi.hoisted(() => ({
  getModelCapability: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@the-seven/db", () => dbMocks);
vi.mock("../services/models", () => modelMocks);
vi.mock("../adapters/openrouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../adapters/openrouter")>();
  return {
    ...actual,
    callOpenRouter: adapterMocks.callOpenRouter,
    fetchOpenRouterGeneration: adapterMocks.fetchOpenRouterGeneration,
  };
});

import { OpenRouterUnsupportedParameterError, runOpenRouterPhaseCall } from "./openrouterRun";

describe("runOpenRouterPhaseCall", () => {
  test("records and denies unsupported non-null tuning before provider execution", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["temperature"],
      refreshedAt: new Date("2026-05-09T10:00:00.000Z"),
    });

    const result = await runOpenRouterPhaseCall({
      sessionId: 12,
      phase: 1,
      memberPosition: 1,
      apiKey: "sk-or-secret",
      modelId: "provider/model",
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "user" },
      ],
      tuning: {
        temperature: 0.7,
        topP: 0.9,
        seed: null,
        verbosity: null,
        reasoningEffort: null,
        includeReasoning: null,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(OpenRouterUnsupportedParameterError);
    expect(adapterMocks.callOpenRouter).not.toHaveBeenCalled();
    expect(adapterMocks.fetchOpenRouterGeneration).not.toHaveBeenCalled();
    expect(dbMocks.createProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 12,
        requestModelId: "provider/model",
        supportedParametersJson: ["temperature"],
        sentParametersJson: [],
        deniedParametersJson: ["top_p"],
        responseId: null,
        responseModel: null,
        billingLookupStatus: "not_requested",
      }),
    );
  });

  test("records missing catalog capability before provider execution", async () => {
    modelMocks.getModelCapability.mockResolvedValue(null);

    const result = await runOpenRouterPhaseCall({
      sessionId: 13,
      phase: 2,
      memberPosition: 2,
      apiKey: "sk-or-secret",
      modelId: "missing/model",
      messages: [{ role: "user", content: "user" }],
      tuning: null,
    });

    expect(result.ok).toBe(false);
    expect(adapterMocks.callOpenRouter).not.toHaveBeenCalled();
    expect(dbMocks.createProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 13,
        requestModelId: "missing/model",
        supportedParametersJson: [],
        sentParametersJson: [],
        deniedParametersJson: ["model"],
        billingLookupStatus: "not_requested",
      }),
    );
  });
});
