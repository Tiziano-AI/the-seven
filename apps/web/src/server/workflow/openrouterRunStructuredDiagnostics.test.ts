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
import { OpenRouterUnsupportedParameterError, runOpenRouterPhaseCall } from "./openrouterRun";

function testLease(sessionId: number) {
  return buildClaimedLease({
    sessionId,
    jobId: sessionId + 100,
    leaseOwner: `worker:test:${sessionId}`,
  });
}

describe("runOpenRouterPhaseCall structured-output diagnostics", () => {
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

  test("denies phase-two models without structured output support before provider execution", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["temperature", "max_tokens"],
      maxCompletionTokens: 64_000,
      expirationDate: null,
      refreshedAt: new Date("2026-05-09T10:00:00.000Z"),
    });

    const result = await runOpenRouterPhaseCall({
      sessionId: 15,
      phase: 2,
      memberPosition: 2,
      apiKey: "sk-or-secret",
      modelId: "provider/model",
      messages: [{ role: "user", content: "user" }],
      tuning: null,
      claimedLease: testLease(15),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(OpenRouterUnsupportedParameterError);
    expect(adapterMocks.callOpenRouter).not.toHaveBeenCalled();
    expect(dbMocks.createProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        sentParametersJson: [],
        deniedParametersJson: ["response_format", "structured_outputs"],
        billingLookupStatus: "not_requested",
      }),
    );
  });

  test("records the exact missing phase-two structured output capability", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["response_format", "max_tokens"],
      maxCompletionTokens: 64_000,
      expirationDate: null,
      refreshedAt: new Date("2026-05-09T10:00:00.000Z"),
    });

    const result = await runOpenRouterPhaseCall({
      sessionId: 15,
      phase: 2,
      memberPosition: 3,
      apiKey: "sk-or-secret",
      modelId: "provider/model",
      messages: [{ role: "user", content: "user" }],
      tuning: null,
      claimedLease: testLease(15),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(OpenRouterUnsupportedParameterError);
    expect(adapterMocks.callOpenRouter).not.toHaveBeenCalled();
    expect(dbMocks.createProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        sentParametersJson: [],
        deniedParametersJson: ["structured_outputs"],
        billingLookupStatus: "not_requested",
      }),
    );
  });

  test("records the exact missing phase-two response format capability", async () => {
    modelMocks.getModelCapability.mockResolvedValue({
      modelId: "provider/model",
      supportedParameters: ["structured_outputs", "max_tokens"],
      maxCompletionTokens: 64_000,
      expirationDate: null,
      refreshedAt: new Date("2026-05-09T10:00:00.000Z"),
    });

    const result = await runOpenRouterPhaseCall({
      sessionId: 15,
      phase: 2,
      memberPosition: 4,
      apiKey: "sk-or-secret",
      modelId: "provider/model",
      messages: [{ role: "user", content: "user" }],
      tuning: null,
      claimedLease: testLease(15),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(OpenRouterUnsupportedParameterError);
    expect(adapterMocks.callOpenRouter).not.toHaveBeenCalled();
    expect(dbMocks.createProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        sentParametersJson: [],
        deniedParametersJson: ["response_format"],
        billingLookupStatus: "not_requested",
      }),
    );
  });
});
