import { beforeEach, describe, expect, test, vi } from "vitest";

const adapterMocks = vi.hoisted(() => ({
  callOpenRouter: vi.fn(),
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
  };
});

import { buildClaimedLease } from "@the-seven/db";
import { OpenRouterRequestFailedError } from "../adapters/openrouter";
import { OpenRouterPhaseRateLimitError, runOpenRouterPhaseCall } from "./openrouterRun";

function testLease(sessionId: number) {
  return buildClaimedLease({
    sessionId,
    jobId: sessionId + 100,
    leaseOwner: `worker:test:${sessionId}`,
  });
}

describe("runOpenRouterPhaseCall diagnostics", () => {
  beforeEach(() => {
    for (const mock of [
      adapterMocks.callOpenRouter,
      dbMocks.createProviderCall,
      dbMocks.verifyActiveClaimedJobLease,
      modelMocks.getModelCapability,
    ]) {
      mock.mockReset();
    }
    dbMocks.verifyActiveClaimedJobLease.mockResolvedValue(undefined);
  });

  test("records successful provider diagnostics with catalog, sent params, response, and billing status", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["temperature", "top_p", "reasoning", "max_tokens"],
      maxCompletionTokens: 16_384,
      expirationDate: null,
      refreshedAt: new Date("2026-05-12T08:00:00.000Z"),
    });
    adapterMocks.callOpenRouter.mockResolvedValue({
      id: "generation-1",
      model: "provider/served-model",
      choices: [
        {
          message: { role: "assistant", content: "answer" },
          finish_reason: "stop",
          native_finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 13,
        total_tokens: 24,
      },
    });
    const result = await runOpenRouterPhaseCall({
      sessionId: 16,
      phase: 1,
      memberPosition: 3,
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
        reasoningEffort: "low",
        includeReasoning: null,
      },
      claimedLease: testLease(16),
    });

    expect(result).toEqual({ ok: true, content: "answer" });
    expect(dbMocks.createProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        requestModelId: "provider/model",
        requestMaxOutputTokens: 16_384,
        catalogRefreshedAt: new Date("2026-05-12T08:00:00.000Z"),
        supportedParametersJson: ["temperature", "top_p", "reasoning", "max_tokens"],
        sentParametersJson: ["temperature", "top_p", "reasoning", "max_tokens"],
        sentReasoningEffort: "low",
        sentProviderRequireParameters: true,
        sentProviderIgnoredProvidersJson: ["amazon-bedrock", "azure"],
        deniedParametersJson: [],
        responseId: "generation-1",
        responseModel: "provider/served-model",
        billedModelId: "provider/served-model",
        totalCostUsdMicros: null,
        usagePromptTokens: 11,
        usageCompletionTokens: 13,
        usageTotalTokens: 24,
        finishReason: "stop",
        nativeFinishReason: "stop",
        billingLookupStatus: "pending",
      }),
    );
  });

  test("passes abort signals to provider execution", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["reasoning", "max_tokens"],
      maxCompletionTokens: 16_384,
      expirationDate: null,
      refreshedAt: new Date("2026-05-12T08:00:00.000Z"),
    });
    adapterMocks.callOpenRouter.mockResolvedValue({
      id: "generation-1",
      model: "provider/model",
      choices: [{ message: { role: "assistant", content: "answer" } }],
    });

    const controller = new AbortController();
    await runOpenRouterPhaseCall({
      sessionId: 19,
      phase: 1,
      memberPosition: 1,
      apiKey: "sk-or-secret",
      modelId: "provider/model",
      messages: [{ role: "user", content: "user" }],
      tuning: {
        temperature: null,
        topP: null,
        seed: null,
        verbosity: null,
        reasoningEffort: "low",
        includeReasoning: null,
      },
      signal: controller.signal,
      claimedLease: testLease(19),
    });

    expect(adapterMocks.callOpenRouter).toHaveBeenCalledWith(
      "sk-or-secret",
      expect.objectContaining({ max_tokens: 16_384, reasoning: { effort: "low" } }),
      { signal: controller.signal },
    );
  });

  test("lease abort stops before provider execution and diagnostics persistence", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["max_tokens"],
      maxCompletionTokens: 16_384,
      expirationDate: null,
      refreshedAt: new Date("2026-05-12T08:00:00.000Z"),
    });
    const controller = new AbortController();
    controller.abort(new dbMocks.ClaimedJobLeaseLostError());

    await expect(
      runOpenRouterPhaseCall({
        sessionId: 19,
        phase: 1,
        memberPosition: 1,
        apiKey: "sk-or-secret",
        modelId: "provider/model",
        messages: [{ role: "user", content: "user" }],
        tuning: null,
        signal: controller.signal,
        claimedLease: buildClaimedLease({ sessionId: 19, jobId: 27, leaseOwner: "worker:lost" }),
      }),
    ).rejects.toThrow("Claimed job lease lost");

    expect(adapterMocks.callOpenRouter).not.toHaveBeenCalled();
    expect(modelMocks.getModelCapability).not.toHaveBeenCalled();
    expect(dbMocks.createProviderCall).not.toHaveBeenCalled();
  });

  test("lease abort after provider response stops diagnostics persistence", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["max_tokens"],
      maxCompletionTokens: 16_384,
      expirationDate: null,
      refreshedAt: new Date("2026-05-12T08:00:00.000Z"),
    });
    const controller = new AbortController();
    adapterMocks.callOpenRouter.mockImplementation(async () => {
      controller.abort(new dbMocks.ClaimedJobLeaseLostError());
      return {
        id: "generation-1",
        model: "provider/model",
        choices: [{ message: { role: "assistant", content: "answer" } }],
      };
    });

    await expect(
      runOpenRouterPhaseCall({
        sessionId: 19,
        phase: 1,
        memberPosition: 1,
        apiKey: "sk-or-secret",
        modelId: "provider/model",
        messages: [{ role: "user", content: "user" }],
        tuning: null,
        signal: controller.signal,
        claimedLease: buildClaimedLease({ sessionId: 19, jobId: 27, leaseOwner: "worker:lost" }),
      }),
    ).rejects.toThrow("Claimed job lease lost");

    expect(dbMocks.createProviderCall).not.toHaveBeenCalled();
  });

  test("redacts provider request and choice diagnostics without dropping safe fields", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["max_tokens", "response_format", "structured_outputs"],
      maxCompletionTokens: 64_000,
      expirationDate: null,
      refreshedAt: new Date("2026-05-12T08:00:00.000Z"),
    });
    adapterMocks.callOpenRouter.mockResolvedValue({
      id: "generation-2",
      model: "provider/model",
      choices: [
        {
          message: { role: "assistant", content: null },
          error: {
            code: 400,
            message: "Bad key sk-or-secret-token-abcdefghijklmnopqrstuvwxyz123456",
          },
        },
      ],
    });
    const result = await runOpenRouterPhaseCall({
      sessionId: 17,
      phase: 2,
      memberPosition: 4,
      apiKey: "sk-or-secret",
      modelId: "provider/model",
      messages: [{ role: "user", content: "user" }],
      tuning: null,
      claimedLease: testLease(17),
    });

    expect(result.ok).toBe(false);
    expect(dbMocks.createProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        responseId: "generation-2",
        responseModel: "provider/model",
        requestMaxOutputTokens: 64_000,
        sentParametersJson: ["max_tokens", "response_format"],
        sentProviderRequireParameters: true,
        sentProviderIgnoredProvidersJson: ["amazon-bedrock", "azure"],
        deniedParametersJson: [],
        errorMessage: "OpenRouter choice error 400: Bad key [redacted]",
        choiceErrorMessage: "Bad key [redacted]",
        choiceErrorCode: 400,
        billingLookupStatus: "pending",
      }),
    );
  });

  test("records provider choice rate limits as typed phase failures", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["max_tokens"],
      maxCompletionTokens: 16_384,
      expirationDate: null,
      refreshedAt: new Date("2026-05-12T08:00:00.000Z"),
    });
    adapterMocks.callOpenRouter.mockRejectedValue(
      new OpenRouterRequestFailedError({
        status: 429,
        code: 429,
        message: "OpenRouter choice error 429: Too many requests",
        response: {
          id: "generation-429",
          model: "provider/model",
          choices: [
            {
              message: { role: "assistant", content: null },
              error: {
                code: 429,
                message: "Too many requests sk-or-secret-token-abcdefghijklmnopqrstuvwxyz123456",
              },
            },
          ],
        },
      }),
    );
    const result = await runOpenRouterPhaseCall({
      sessionId: 18,
      phase: 1,
      memberPosition: 5,
      apiKey: "sk-or-secret",
      modelId: "provider/model",
      messages: [{ role: "user", content: "user" }],
      tuning: null,
      claimedLease: testLease(18),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected provider choice rate limit to fail.");
    }
    expect(result.error).toBeInstanceOf(OpenRouterPhaseRateLimitError);
    expect(result.error.message).toBe("OpenRouter rate limit exceeded");
    expect(dbMocks.createProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        responseId: "generation-429",
        requestMaxOutputTokens: 16_384,
        errorMessage: "OpenRouter choice error 429: Too many requests",
        choiceErrorMessage: "Too many requests [redacted]",
        choiceErrorCode: 429,
        errorStatus: 429,
        errorCode: "429",
      }),
    );
  });

  test("redacts unsafe upstream error codes before diagnostics persistence", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["max_tokens"],
      maxCompletionTokens: 16_384,
      expirationDate: null,
      refreshedAt: new Date("2026-05-12T08:00:00.000Z"),
    });
    adapterMocks.callOpenRouter.mockRejectedValue(
      new OpenRouterRequestFailedError({
        status: 401,
        code: "sk-or-secret-token-abcdefghijklmnopqrstuvwxyz123456",
        message: "OpenRouter request failed (status 401): secret leaked upstream",
      }),
    );

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
    expect(dbMocks.createProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        errorStatus: 401,
        errorCode: "[redacted]",
        errorMessage: "OpenRouter request failed (status 401): secret leaked upstream",
      }),
    );
  });

  test("preserves bounded upstream error codes in diagnostics", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["max_tokens"],
      maxCompletionTokens: 16_384,
      expirationDate: null,
      refreshedAt: new Date("2026-05-12T08:00:00.000Z"),
    });
    adapterMocks.callOpenRouter.mockRejectedValue(
      new OpenRouterRequestFailedError({
        status: 429,
        code: "rate_limited",
        message: "OpenRouter request failed (status 429): rate limited",
      }),
    );

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
    expect(dbMocks.createProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        errorStatus: 429,
        errorCode: "rate_limited",
      }),
    );
  });
});
