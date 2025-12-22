import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../adapters/openrouter/client", () => {
  class OpenRouterRequestFailedError extends Error {
    readonly status: number | null;

    constructor(params: { status: number | null; message: string }) {
      super(params.message);
      this.name = "OpenRouterRequestFailedError";
      this.status = params.status;
    }
  }

  return {
    callOpenRouter: vi.fn(),
    fetchOpenRouterGeneration: vi.fn(async (apiKey: string, generationId: string) => {
      return {
        id: generationId,
        model: "mock-model",
        total_cost: 0.000001,
        tokens_prompt: 1,
        tokens_completion: 1,
        native_tokens_prompt: 1,
        native_tokens_completion: 1,
      };
    }),
    OpenRouterRequestFailedError,
  };
});

vi.mock("../services/openrouterCatalog", () => {
  return {
    getModelDetails: vi.fn(async (modelId: string) => {
      return {
        modelId,
        modelName: modelId,
        description: "",
        contextLength: 1_000_000,
        maxCompletionTokens: 100_000,
        supportedParameters: [],
        inputModalities: ["text"],
        outputModalities: ["text"],
      };
    }),
  };
});

import { callOpenRouter } from "../adapters/openrouter/client";
import type { OpenRouterResponse } from "../adapters/openrouter/client";
import { buildSessionRunSpec, stringifySessionRunSpec } from "../domain/sessionRunSpec";
import { hashQuestion } from "../domain/questionHash";
import { createMemberResponse, getMemberResponsesBySessionId } from "../stores/memberResponseStore";
import { createMemberReview, getMemberReviewsBySessionId } from "../stores/memberReviewStore";
import { getMemberSynthesisBySessionId } from "../stores/memberSynthesisStore";
import { getOpenRouterCallsBySessionId } from "../stores/openRouterCallStore";
import {
  createSession,
  getSessionById,
  reconcileNonTerminalSessionsToFailed,
} from "../stores/sessionStore";
import { setupTestDatabase } from "../stores/testDb";
import { getOrCreateUserByokId } from "../stores/userStore";
import {
  MEMBER_POSITIONS,
  REVIEWER_MEMBER_POSITIONS,
  SYNTHESIZER_MEMBER_POSITION,
} from "../../shared/domain/sevenMembers";
import { orchestrateSession } from "./orchestration";

function buildRunSpec(params: { userMessage: string }): string {
  const spec = buildSessionRunSpec({
    now: new Date(),
    query: params.userMessage,
    attachments: [],
    outputFormats: { phase1: "\n", phase2: "\n", phase3: "\n" },
    council: {
      nameAtRun: "Test Council",
      phasePrompts: { phase1: "phase1\n", phase2: "phase2\n", phase3: "phase3\n" },
      members: MEMBER_POSITIONS.map((memberPosition) => ({
        memberPosition,
        model: { provider: "openrouter", modelId: `model-${memberPosition}` },
        tuning: null,
      })),
    },
  });
  return stringifySessionRunSpec(spec);
}

describe("orchestrateSession", () => {
  beforeEach(() => {
    setupTestDatabase();
    vi.mocked(callOpenRouter).mockReset();
  });

  it("continues a failed session without re-running persisted artifacts", async () => {
    const user = await getOrCreateUserByokId("byok-test");
    const runSpec = buildRunSpec({ userMessage: "What is idempotency?" });

    const sessionId = await createSession({
      userId: user.id,
      query: "What is idempotency?",
      attachedFilesMarkdown: "[]",
      councilNameAtRun: "Test Council",
      runSpec,
      questionHash: hashQuestion("What is idempotency?"),
      ingressSource: "web",
      ingressVersion: null,
      status: "failed",
      failureKind: "phase1_inference_failed",
    });

    await createMemberResponse({
      sessionId,
      memberPosition: 1,
      modelId: "model-1",
      response: "Existing response 1",
    });

    vi.mocked(callOpenRouter).mockImplementation(async (_apiKey, request) => {
      const response: OpenRouterResponse = {
        id: `resp_${request.model}`,
        model: request.model,
        choices: [
          {
            message: {
              role: "assistant",
              content: `content for ${request.model}`,
            },
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      };
      return response;
    });

    await orchestrateSession({
      traceId: "trace-test",
      sessionId,
      userId: user.id,
      apiKey: "key-test",
    });

    // Phase 1: 5 missing responses, Phase 2: 6 reviews, Phase 3: 1 synthesis.
    expect(vi.mocked(callOpenRouter).mock.calls.length).toBe(12);

    const session = await getSessionById(sessionId);
    expect(session?.status).toBe("completed");
    expect(session?.failureKind).toBe(null);

    const responses = await getMemberResponsesBySessionId(sessionId);
    expect(responses.length).toBe(6);
    expect(responses.some((r) => r.memberPosition === 1 && r.response === "Existing response 1")).toBe(true);

    const reviews = await getMemberReviewsBySessionId(sessionId);
    expect(reviews.length).toBe(6);

    const synthesis = await getMemberSynthesisBySessionId(sessionId);
    expect(synthesis).not.toBeNull();

    const calls = await getOpenRouterCallsBySessionId(sessionId);
    expect(calls.length).toBe(12);
  });

  it("records failureKind on startup reconciliation", async () => {
    const user = await getOrCreateUserByokId("byok-test");
    const runSpec = buildRunSpec({ userMessage: "Hello" });

    const pendingId = await createSession({
      userId: user.id,
      query: "Hello",
      attachedFilesMarkdown: "[]",
      councilNameAtRun: "Test Council",
      runSpec,
      questionHash: hashQuestion("Hello"),
      ingressSource: "web",
      ingressVersion: null,
      status: "pending",
    });

    const processingId = await createSession({
      userId: user.id,
      query: "Hello again",
      attachedFilesMarkdown: "[]",
      councilNameAtRun: "Test Council",
      runSpec,
      questionHash: hashQuestion("Hello again"),
      ingressSource: "web",
      ingressVersion: null,
      status: "processing",
    });

    const summary = await reconcileNonTerminalSessionsToFailed();
    expect(summary.pendingCount).toBe(1);
    expect(summary.processingCount).toBe(1);

    const pending = await getSessionById(pendingId);
    expect(pending?.status).toBe("failed");
    expect(pending?.failureKind).toBe("server_restart");

    const processing = await getSessionById(processingId);
    expect(processing?.status).toBe("failed");
    expect(processing?.failureKind).toBe("server_restart");
  });

  it("sets phase failureKind when Phase 1 inference fails", async () => {
    const user = await getOrCreateUserByokId("byok-test");
    const runSpec = buildRunSpec({ userMessage: "Test failure" });

    const sessionId = await createSession({
      userId: user.id,
      query: "Test failure",
      attachedFilesMarkdown: "[]",
      councilNameAtRun: "Test Council",
      runSpec,
      questionHash: hashQuestion("Test failure"),
      ingressSource: "web",
      ingressVersion: null,
      status: "pending",
    });

    vi.mocked(callOpenRouter).mockImplementation(async (_apiKey, request) => {
      if (request.model === "model-3") {
        throw new Error("boom");
      }
      const response: OpenRouterResponse = {
        id: `resp_${request.model}`,
        model: request.model,
        choices: [
          {
            message: {
              role: "assistant",
              content: `content for ${request.model}`,
            },
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      };
      return response;
    });

    await orchestrateSession({
      traceId: "trace-test",
      sessionId,
      userId: user.id,
      apiKey: "key-test",
    });

    const session = await getSessionById(sessionId);
    expect(session?.status).toBe("failed");
    expect(session?.failureKind).toBe("phase1_inference_failed");

    const calls = await getOpenRouterCallsBySessionId(sessionId);
    expect(calls.length).toBe(REVIEWER_MEMBER_POSITIONS.length);
    expect(calls.some((call) => call.phase === 1 && call.memberPosition === 3 && call.errorMessage === "boom")).toBe(true);
  });

  it("fails hard when a model returns empty assistant content", async () => {
    const user = await getOrCreateUserByokId("byok-test");
    const runSpec = buildRunSpec({ userMessage: "Test empty content" });

    const sessionId = await createSession({
      userId: user.id,
      query: "Test empty content",
      attachedFilesMarkdown: "[]",
      councilNameAtRun: "Test Council",
      runSpec,
      questionHash: hashQuestion("Test empty content"),
      ingressSource: "web",
      ingressVersion: null,
      status: "pending",
    });

    vi.mocked(callOpenRouter).mockImplementation(async (_apiKey, request) => {
      const content = request.model === "model-4" ? null : `content for ${request.model}`;
      const response: OpenRouterResponse = {
        id: `resp_${request.model}`,
        model: request.model,
        choices: [
          {
            message: {
              role: "assistant",
              content,
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      };
      return response;
    });

    await orchestrateSession({
      traceId: "trace-test",
      sessionId,
      userId: user.id,
      apiKey: "key-test",
    });

    const session = await getSessionById(sessionId);
    expect(session?.status).toBe("failed");
    expect(session?.failureKind).toBe("phase1_inference_failed");

    const responses = await getMemberResponsesBySessionId(sessionId);
    expect(responses.some((r) => r.memberPosition === 4)).toBe(false);

    const calls = await getOpenRouterCallsBySessionId(sessionId);
    expect(calls.length).toBe(REVIEWER_MEMBER_POSITIONS.length);
    expect(
      calls.some(
        (call) =>
          call.phase === 1 &&
          call.memberPosition === 4 &&
          (call.errorMessage ?? "").includes("Empty model output")
      )
    ).toBe(true);
  });
});
