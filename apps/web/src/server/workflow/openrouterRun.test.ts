import { beforeEach, describe, expect, test, vi } from "vitest";

const adapterMocks = vi.hoisted(() => ({
  callOpenRouter: vi.fn(),
  fetchOpenRouterGeneration: vi.fn(),
}));
const dbMocks = vi.hoisted(() => {
  class MockClaimedJobLeaseLostError extends Error {
    constructor() {
      super("Claimed job lease lost");
      this.name = "ClaimedJobLeaseLostError";
    }
  }

  return {
    buildClaimedLease: vi.fn(
      (input: { sessionId: number; jobId: number; leaseOwner: string }) => input,
    ),
    ClaimedJobLeaseLostError: MockClaimedJobLeaseLostError,
    createProviderCall: vi.fn(),
    listProviderCalls: vi.fn(),
    refreshSessionUsageTotals: vi.fn(),
    updateProviderCallBillingStatus: vi.fn(),
    updateProviderCallCost: vi.fn(),
    verifyActiveClaimedJobLease: vi.fn(),
  };
});
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

import { buildClaimedLease } from "@the-seven/db";
import { OpenRouterRequestFailedError } from "../adapters/openrouter";
import { OpenRouterUnsupportedParameterError, runOpenRouterPhaseCall } from "./openrouterRun";

function testLease(sessionId: number) {
  return buildClaimedLease({
    sessionId,
    jobId: sessionId + 100,
    leaseOwner: `worker:test:${sessionId}`,
  });
}

describe("runOpenRouterPhaseCall", () => {
  beforeEach(() => {
    for (const mock of [
      adapterMocks.callOpenRouter,
      adapterMocks.fetchOpenRouterGeneration,
      dbMocks.createProviderCall,
      dbMocks.listProviderCalls,
      dbMocks.refreshSessionUsageTotals,
      dbMocks.updateProviderCallBillingStatus,
      dbMocks.updateProviderCallCost,
      dbMocks.verifyActiveClaimedJobLease,
      modelMocks.getModelCapability,
    ]) {
      mock.mockReset();
    }
    dbMocks.verifyActiveClaimedJobLease.mockResolvedValue(undefined);
  });

  test("records and denies unsupported non-null tuning before provider execution", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["temperature", "max_tokens"],
      maxCompletionTokens: 16_384,
      expirationDate: null,
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
      claimedLease: testLease(12),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(OpenRouterUnsupportedParameterError);
    expect(adapterMocks.callOpenRouter).not.toHaveBeenCalled();
    expect(adapterMocks.fetchOpenRouterGeneration).not.toHaveBeenCalled();
    expect(dbMocks.createProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 12,
        requestModelId: "provider/model",
        supportedParametersJson: ["temperature", "max_tokens"],
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
      claimedLease: testLease(13),
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

  test("denies models without output-cap support before provider execution", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["temperature"],
      maxCompletionTokens: 16_384,
      expirationDate: null,
      refreshedAt: new Date("2026-05-09T10:00:00.000Z"),
    });

    const result = await runOpenRouterPhaseCall({
      sessionId: 20,
      phase: 1,
      memberPosition: 1,
      apiKey: "sk-or-secret",
      modelId: "provider/model",
      messages: [{ role: "user", content: "user" }],
      tuning: null,
      claimedLease: testLease(20),
    });

    expect(result.ok).toBe(false);
    expect(adapterMocks.callOpenRouter).not.toHaveBeenCalled();
    expect(dbMocks.createProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        sentParametersJson: [],
        deniedParametersJson: ["max_tokens"],
        requestMaxOutputTokens: null,
      }),
    );
  });

  test("denies expiring catalog rows before provider execution", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["max_tokens"],
      maxCompletionTokens: 16_384,
      expirationDate: "2026-05-15",
      refreshedAt: new Date("2026-05-09T10:00:00.000Z"),
    });

    const result = await runOpenRouterPhaseCall({
      sessionId: 21,
      phase: 1,
      memberPosition: 1,
      apiKey: "sk-or-secret",
      modelId: "provider/model",
      messages: [{ role: "user", content: "user" }],
      tuning: null,
      claimedLease: testLease(21),
    });

    expect(result.ok).toBe(false);
    expect(adapterMocks.callOpenRouter).not.toHaveBeenCalled();
    expect(dbMocks.createProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        sentParametersJson: [],
        deniedParametersJson: ["model_expiration"],
        requestMaxOutputTokens: null,
      }),
    );
  });

  test("denies catalog rows below the phase output cap before provider execution", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["max_tokens"],
      maxCompletionTokens: 512,
      expirationDate: null,
      refreshedAt: new Date("2026-05-09T10:00:00.000Z"),
    });

    const result = await runOpenRouterPhaseCall({
      sessionId: 22,
      phase: 3,
      memberPosition: 7,
      apiKey: "sk-or-secret",
      modelId: "provider/model",
      messages: [{ role: "user", content: "user" }],
      tuning: null,
      claimedLease: testLease(22),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(OpenRouterUnsupportedParameterError);
    expect(adapterMocks.callOpenRouter).not.toHaveBeenCalled();
    expect(dbMocks.createProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        sentParametersJson: [],
        deniedParametersJson: ["max_tokens"],
        requestMaxOutputTokens: null,
      }),
    );
  });

  test("requests structured JSON for phase-two evaluations", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["max_tokens", "response_format", "structured_outputs"],
      maxCompletionTokens: 64_000,
      expirationDate: null,
      refreshedAt: new Date("2026-05-09T10:00:00.000Z"),
    });
    adapterMocks.callOpenRouter.mockResolvedValue({
      id: "generation-1",
      model: "provider/model",
      choices: [{ message: { role: "assistant", content: "{}" } }],
    });
    adapterMocks.fetchOpenRouterGeneration.mockResolvedValue(null);

    const result = await runOpenRouterPhaseCall({
      sessionId: 14,
      phase: 2,
      memberPosition: 2,
      apiKey: "sk-or-secret",
      modelId: "provider/model",
      messages: [{ role: "user", content: "user" }],
      tuning: null,
      claimedLease: testLease(14),
    });

    expect(result.ok).toBe(true);
    expect(adapterMocks.callOpenRouter).toHaveBeenCalledWith(
      "sk-or-secret",
      expect.objectContaining({
        max_tokens: 64_000,
        response_format: expect.objectContaining({
          type: "json_schema",
        }),
        provider: {
          require_parameters: true,
          ignore: ["amazon-bedrock", "azure"],
        },
      }),
      { signal: undefined },
    );
    expect(dbMocks.createProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        requestMaxOutputTokens: 64_000,
        sentParametersJson: ["max_tokens", "response_format"],
        sentProviderRequireParameters: true,
        sentProviderIgnoredProvidersJson: ["amazon-bedrock", "azure"],
        deniedParametersJson: [],
      }),
    );
  });

  test("retries explicit OpenRouter credit-limit max_tokens errors with a conservative affordable cap", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["max_tokens"],
      maxCompletionTokens: 64_000,
      expirationDate: null,
      refreshedAt: new Date("2026-05-09T10:00:00.000Z"),
    });
    adapterMocks.callOpenRouter
      .mockRejectedValueOnce(
        new OpenRouterRequestFailedError({
          status: 402,
          code: 402,
          message:
            "OpenRouter request failed (status 402): This request requires more credits, or fewer max_tokens. You requested up to 64000 tokens, but can only afford 26442. To increase, visit https://openrouter.ai/workspaces/default/keys/4f48acaa3121b1438f827d94ecac1cb49eafc5279af4ef46aad0cebc4d29a1e0",
        }),
      )
      .mockResolvedValueOnce({
        id: "generation-retry",
        model: "provider/model",
        choices: [{ message: { role: "assistant", content: "synthesis" } }],
      });

    const result = await runOpenRouterPhaseCall({
      sessionId: 24,
      phase: 3,
      memberPosition: 7,
      apiKey: "sk-or-secret",
      modelId: "provider/model",
      messages: [{ role: "user", content: "user" }],
      tuning: null,
      claimedLease: testLease(24),
    });

    expect(result).toEqual({ ok: true, content: "synthesis" });
    expect(adapterMocks.callOpenRouter).toHaveBeenNthCalledWith(
      1,
      "sk-or-secret",
      expect.objectContaining({ max_tokens: 64_000 }),
      { signal: undefined },
    );
    expect(adapterMocks.callOpenRouter).toHaveBeenNthCalledWith(
      2,
      "sk-or-secret",
      expect.objectContaining({ max_tokens: 25_119 }),
      { signal: undefined },
    );
    expect(dbMocks.createProviderCall).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        requestMaxOutputTokens: 64_000,
        errorStatus: 402,
        errorCode: "402",
        billingLookupStatus: "not_requested",
        errorMessage: expect.stringContaining("visit [redacted]"),
      }),
    );
    expect(dbMocks.createProviderCall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        requestMaxOutputTokens: 25_119,
        responseId: "generation-retry",
        billingLookupStatus: "pending",
        errorMessage: null,
      }),
    );
  });

  test("verifies the active DB lease before catalog lookup or provider execution", async () => {
    dbMocks.verifyActiveClaimedJobLease.mockRejectedValue(new dbMocks.ClaimedJobLeaseLostError());

    await expect(
      runOpenRouterPhaseCall({
        sessionId: 23,
        phase: 1,
        memberPosition: 1,
        apiKey: "sk-or-secret",
        modelId: "provider/model",
        messages: [{ role: "user", content: "user" }],
        tuning: null,
        claimedLease: buildClaimedLease({ sessionId: 23, jobId: 31, leaseOwner: "worker:lost" }),
      }),
    ).rejects.toThrow("Claimed job lease lost");

    expect(dbMocks.verifyActiveClaimedJobLease).toHaveBeenCalledWith({
      sessionId: 23,
      jobId: 31,
      leaseOwner: "worker:lost",
      now: expect.any(Date),
    });
    expect(modelMocks.getModelCapability).not.toHaveBeenCalled();
    expect(adapterMocks.callOpenRouter).not.toHaveBeenCalled();
    expect(dbMocks.createProviderCall).not.toHaveBeenCalled();
  });
});
