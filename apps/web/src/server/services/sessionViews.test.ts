import { routeContract, sessionDiagnosticsPayloadSchema } from "@the-seven/contracts";
import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getSessionById: vi.fn(),
  getSessionTerminalError: vi.fn(),
  listCatalogModelsByIds: vi.fn(),
  listProviderCalls: vi.fn(),
  listSessionArtifacts: vi.fn(),
  listSessionsByUserId: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@the-seven/config", () => ({
  BUILT_IN_MODEL_SEEDS: [{ modelId: "built-in-model", modelName: "Built In Model" }],
}));

vi.mock("@the-seven/db", () => dbMocks);

async function loadSessionViews() {
  return import("./sessionViews");
}

describe("sessionViews service", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of [
      dbMocks.getSessionById,
      dbMocks.getSessionTerminalError,
      dbMocks.listCatalogModelsByIds,
      dbMocks.listProviderCalls,
      dbMocks.listSessionArtifacts,
      dbMocks.listSessionsByUserId,
    ]) {
      mock.mockReset();
    }
  });

  test("emits a contract-valid first-poll detail for processing sessions without child rows", async () => {
    dbMocks.getSessionById.mockResolvedValue({
      id: 12,
      userId: 3,
      query: "When is a council worth the latency?",
      questionHash: "hash-processing",
      ingressSource: "web",
      ingressVersion: null,
      councilNameAtRun: "The Commons Council",
      status: "processing",
      failureKind: null,
      createdAt: new Date("2026-05-14T01:25:29.823Z"),
      updatedAt: new Date("2026-05-14T01:25:30.363Z"),
      totalTokens: 0,
      totalCostUsdMicros: 0,
      totalCostIsPartial: false,
      snapshotJson: {
        version: 1,
        createdAt: "2026-05-14T01:25:29.782Z",
        query: "When is a council worth the latency?",
        userMessage: "When is a council worth the latency?",
        attachments: [],
        outputFormats: {
          phase1: "phase1",
          phase2: "phase2",
          phase3: "phase3",
        },
        council: {
          nameAtRun: "The Commons Council",
          phasePrompts: {
            phase1: "prompt1",
            phase2: "prompt2",
            phase3: "prompt3",
          },
          members: [1, 2, 3, 4, 5, 6, 7].map((memberPosition) => ({
            memberPosition,
            model: { provider: "openrouter", modelId: `model-${memberPosition}` },
            tuning: null,
          })),
        },
      },
    });
    dbMocks.listSessionArtifacts.mockResolvedValue([]);
    dbMocks.listProviderCalls.mockResolvedValue([]);
    dbMocks.listCatalogModelsByIds.mockResolvedValue([]);
    dbMocks.getSessionTerminalError.mockResolvedValue(null);

    const { getSessionDetail } = await loadSessionViews();
    const detail = await getSessionDetail(3, 12);

    routeContract("sessions.get").successPayloadSchema.parse(detail);
    expect(detail.session.status).toBe("processing");
    expect(detail.artifacts).toEqual([]);
    expect(detail.providerCalls).toEqual([]);
    expect(detail.terminalError).toBeNull();
    expect(dbMocks.getSessionTerminalError).not.toHaveBeenCalled();
  });

  test("exposes terminal errors only for failed session detail and diagnostics", async () => {
    dbMocks.getSessionById.mockResolvedValue({
      id: 13,
      userId: 3,
      query: "Why did the review fail?",
      questionHash: "hash-failed",
      ingressSource: "web",
      ingressVersion: null,
      councilNameAtRun: "The Lantern Council",
      status: "failed",
      failureKind: "phase2_inference_failed",
      createdAt: new Date("2026-05-14T01:25:29.823Z"),
      updatedAt: new Date("2026-05-14T01:25:30.363Z"),
      totalTokens: 0,
      totalCostUsdMicros: 0,
      totalCostIsPartial: true,
      snapshotJson: {
        version: 1,
        createdAt: "2026-05-14T01:25:29.782Z",
        query: "Why did the review fail?",
        userMessage: "Why did the review fail?",
        attachments: [],
        outputFormats: {
          phase1: "phase1",
          phase2: "phase2",
          phase3: "phase3",
        },
        council: {
          nameAtRun: "The Lantern Council",
          phasePrompts: {
            phase1: "prompt1",
            phase2: "prompt2",
            phase3: "prompt3",
          },
          members: [1, 2, 3, 4, 5, 6, 7].map((memberPosition) => ({
            memberPosition,
            model: { provider: "openrouter", modelId: `model-${memberPosition}` },
            tuning: null,
          })),
        },
      },
    });
    dbMocks.listSessionArtifacts.mockResolvedValue([]);
    dbMocks.listProviderCalls.mockResolvedValue([]);
    dbMocks.listCatalogModelsByIds.mockResolvedValue([]);
    dbMocks.getSessionTerminalError.mockResolvedValue(
      "Phase 2 evaluation is invalid: list too long",
    );

    const { getSessionDetail, getSessionDiagnostics } = await loadSessionViews();
    const detail = await getSessionDetail(3, 13);
    const diagnostics = await getSessionDiagnostics(3, 13);

    routeContract("sessions.get").successPayloadSchema.parse(detail);
    sessionDiagnosticsPayloadSchema.parse(diagnostics);
    expect(detail.terminalError).toBe("Phase 2 evaluation is invalid: list too long");
    expect(diagnostics.terminalError).toBe("Phase 2 evaluation is invalid: list too long");
    expect(dbMocks.getSessionTerminalError).toHaveBeenCalledTimes(2);
  });

  test("maps session detail into the public contract shape", async () => {
    dbMocks.getSessionById.mockResolvedValue({
      id: 9,
      userId: 3,
      query: "What should we ship?",
      questionHash: "hash-1",
      ingressSource: "web",
      ingressVersion: null,
      councilNameAtRun: "The Founding Council",
      status: "completed",
      failureKind: null,
      createdAt: new Date("2026-04-02T10:00:00.000Z"),
      updatedAt: new Date("2026-04-02T10:05:00.000Z"),
      totalTokens: 321,
      totalCostUsdMicros: 123456,
      totalCostIsPartial: false,
      snapshotJson: {
        version: 1,
        createdAt: "2026-04-02T10:00:00.000Z",
        query: "What should we ship?",
        userMessage: "What should we ship?",
        attachments: [],
        outputFormats: {
          phase1: "phase1",
          phase2: "phase2",
          phase3: "phase3",
        },
        council: {
          nameAtRun: "The Founding Council",
          phasePrompts: {
            phase1: "prompt1",
            phase2: "prompt2",
            phase3: "prompt3",
          },
          members: [1, 2, 3, 4, 5, 6, 7].map((memberPosition) => ({
            memberPosition,
            model: { provider: "openrouter", modelId: `model-${memberPosition}` },
            tuning: null,
          })),
        },
      },
    });
    dbMocks.listSessionArtifacts.mockResolvedValue([
      {
        id: 1,
        sessionId: 9,
        phase: 3,
        artifactKind: "synthesis",
        memberPosition: 7,
        modelId: "model-7",
        content: "Final answer",
        tokensUsed: 50,
        costUsdMicros: 100,
        createdAt: new Date("2026-04-02T10:05:00.000Z"),
      },
    ]);
    dbMocks.listProviderCalls.mockResolvedValue([
      {
        id: 11,
        sessionId: 9,
        phase: 3,
        memberPosition: 7,
        requestModelId: "model-7",
        requestMaxOutputTokens: 8192,
        catalogRefreshedAt: new Date("2026-04-02T10:03:00.000Z"),
        supportedParametersJson: ["temperature", "reasoning"],
        sentParametersJson: ["temperature", "reasoning"],
        sentReasoningEffort: "low",
        sentProviderRequireParameters: true,
        sentProviderIgnoredProvidersJson: ["amazon-bedrock", "azure"],
        deniedParametersJson: [],
        requestSystemChars: 10,
        requestUserChars: 20,
        requestTotalChars: 30,
        requestStartedAt: new Date("2026-04-02T10:04:00.000Z"),
        responseCompletedAt: new Date("2026-04-02T10:05:00.000Z"),
        latencyMs: 1000,
        responseModel: "model-7",
        billedModelId: "model-7",
        totalCostUsdMicros: 100,
        usagePromptTokens: 10,
        usageCompletionTokens: 40,
        usageTotalTokens: 50,
        finishReason: "stop",
        nativeFinishReason: "stop",
        errorMessage: null,
        choiceErrorMessage: null,
        choiceErrorCode: null,
        errorStatus: null,
        errorCode: null,
        billingLookupStatus: "succeeded",
        responseId: "resp-1",
        createdAt: new Date("2026-04-02T10:05:00.000Z"),
      },
    ]);
    dbMocks.listCatalogModelsByIds.mockResolvedValue([
      {
        modelId: "model-7",
        modelName: "Model Seven",
      },
    ]);
    dbMocks.getSessionTerminalError.mockRejectedValue(
      new Error("stale terminal error should stay private"),
    );

    const { getSessionDetail, getSessionDiagnostics } = await loadSessionViews();
    const detail = await getSessionDetail(3, 9);

    expect(detail.session).toMatchObject({
      id: 9,
      query: "What should we ship?",
      totalTokens: 321,
      totalCost: "0.123456",
    });
    expect(detail.artifacts[0]).toMatchObject({
      artifactKind: "synthesis",
      modelName: "Model Seven",
      member: {
        alias: "G",
        role: "synthesizer",
      },
    });
    expect(detail.providerCalls[0]).toMatchObject({
      requestModelName: "Model Seven",
      requestMaxOutputTokens: 8192,
      catalogRefreshedAt: "2026-04-02T10:03:00.000Z",
      supportedParameters: ["temperature", "reasoning"],
      sentParameters: ["temperature", "reasoning"],
      sentReasoningEffort: "low",
      sentProviderRequireParameters: true,
      sentProviderIgnoredProviders: ["amazon-bedrock", "azure"],
      deniedParameters: [],
      billingLookupStatus: "succeeded",
      responseId: "resp-1",
    });
    expect(detail.terminalError).toBeNull();
    const diagnostics = await getSessionDiagnostics(3, 9);
    expect(diagnostics.terminalError).toBeNull();
    sessionDiagnosticsPayloadSchema.parse(diagnostics);
    expect(dbMocks.listSessionArtifacts).toHaveBeenCalledTimes(1);
    expect(dbMocks.getSessionTerminalError).not.toHaveBeenCalled();
  });

  test("exports sessions as markdown and json from the same detail contract", async () => {
    dbMocks.getSessionById.mockResolvedValue({
      id: 9,
      userId: 3,
      query: "What should we ship?",
      questionHash: "hash-1",
      ingressSource: "web",
      ingressVersion: null,
      councilNameAtRun: "The Founding Council",
      status: "completed",
      failureKind: null,
      createdAt: new Date("2026-04-02T10:00:00.000Z"),
      updatedAt: new Date("2026-04-02T10:05:00.000Z"),
      totalTokens: 321,
      totalCostUsdMicros: 123456,
      totalCostIsPartial: false,
      snapshotJson: {
        version: 1,
        createdAt: "2026-04-02T10:00:00.000Z",
        query: "What should we ship?",
        userMessage: "What should we ship?",
        attachments: [],
        outputFormats: {
          phase1: "phase1",
          phase2: "phase2",
          phase3: "phase3",
        },
        council: {
          nameAtRun: "The Founding Council",
          phasePrompts: {
            phase1: "prompt1",
            phase2: "prompt2",
            phase3: "prompt3",
          },
          members: [1, 2, 3, 4, 5, 6, 7].map((memberPosition) => ({
            memberPosition,
            model: { provider: "openrouter", modelId: `model-${memberPosition}` },
            tuning: null,
          })),
        },
      },
    });
    dbMocks.listSessionArtifacts.mockResolvedValue([
      {
        id: 1,
        sessionId: 9,
        phase: 1,
        artifactKind: "response",
        memberPosition: 1,
        modelId: "model-1",
        content: "Answer A",
        tokensUsed: null,
        costUsdMicros: null,
        createdAt: new Date("2026-04-02T10:01:00.000Z"),
      },
    ]);
    dbMocks.listProviderCalls.mockResolvedValue([]);
    dbMocks.listCatalogModelsByIds.mockResolvedValue([
      {
        modelId: "model-1",
        modelName: "Claude",
      },
    ]);
    dbMocks.getSessionTerminalError.mockResolvedValue(null);

    const { exportSessions } = await loadSessionViews();
    const exported = await exportSessions(3, [9]);

    expect(exported.markdown).toContain("# Run 9");
    expect(exported.markdown).toContain("## Question");
    expect(exported.markdown).toContain("### Phase 1 · Member A · response");
    expect(exported.markdown).toContain("Answer A");
    expect(exported.json).toContain('"id": 9');
    expect(exported.json).toContain('"artifactKind": "response"');
  });

  test("validates stored phase-2 review content before public detail emission", async () => {
    dbMocks.getSessionById.mockResolvedValue({
      id: 10,
      userId: 3,
      query: "What should we ship?",
      questionHash: "hash-2",
      ingressSource: "web",
      ingressVersion: null,
      councilNameAtRun: "The Founding Council",
      status: "completed",
      failureKind: null,
      createdAt: new Date("2026-04-02T10:00:00.000Z"),
      updatedAt: new Date("2026-04-02T10:05:00.000Z"),
      totalTokens: 321,
      totalCostUsdMicros: 123456,
      totalCostIsPartial: false,
      snapshotJson: {
        version: 1,
        createdAt: "2026-04-02T10:00:00.000Z",
        query: "What should we ship?",
        userMessage: "What should we ship?",
        attachments: [],
        outputFormats: {
          phase1: "phase1",
          phase2: "phase2",
          phase3: "phase3",
        },
        council: {
          nameAtRun: "The Founding Council",
          phasePrompts: {
            phase1: "prompt1",
            phase2: "prompt2",
            phase3: "prompt3",
          },
          members: [1, 2, 3, 4, 5, 6, 7].map((memberPosition) => ({
            memberPosition,
            model: { provider: "openrouter", modelId: `model-${memberPosition}` },
            tuning: null,
          })),
        },
      },
    });
    dbMocks.listSessionArtifacts.mockResolvedValue([
      {
        id: 2,
        sessionId: 10,
        phase: 2,
        artifactKind: "review",
        memberPosition: 1,
        modelId: "model-1",
        content: JSON.stringify({ ranking: ["A", "B", "C", "D", "E", "F"], reviews: {} }),
        tokensUsed: null,
        costUsdMicros: null,
        createdAt: new Date("2026-04-02T10:03:00.000Z"),
      },
    ]);
    dbMocks.listProviderCalls.mockResolvedValue([]);
    dbMocks.listCatalogModelsByIds.mockResolvedValue([]);
    dbMocks.getSessionTerminalError.mockResolvedValue(null);

    const { getSessionDetail } = await loadSessionViews();

    await expect(getSessionDetail(3, 10)).rejects.toThrow("Stored Phase 2 evaluation is invalid");
  });
});
