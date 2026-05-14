import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  class MockClaimedJobLeaseLostError extends Error {
    constructor() {
      super("Claimed job lease lost");
      this.name = "ClaimedJobLeaseLostError";
    }
  }

  return {
    ClaimedJobLeaseLostError: MockClaimedJobLeaseLostError,
    createSessionArtifact: vi.fn(),
    getSessionArtifact: vi.fn(),
    getSessionById: vi.fn(),
    listSessionArtifacts: vi.fn(),
    markClaimedSessionCompleted: vi.fn(),
    markClaimedSessionFailed: vi.fn(),
    markJobCompleted: vi.fn(),
    markJobFailed: vi.fn(),
    refreshSessionUsageTotals: vi.fn(),
    startClaimedSessionProcessing: vi.fn(),
    verifyActiveClaimedJobLease: vi.fn(),
  };
});

const snapshotMocks = vi.hoisted(() => ({
  buildSystemPromptForPhase: vi.fn(),
  getSnapshotMember: vi.fn(),
}));

const credentialMocks = vi.hoisted(() => ({
  decryptJobCredential: vi.fn(),
}));

const runMocks = vi.hoisted(() => {
  class MockRateLimitError extends Error {}

  return {
    scheduleSessionCostBackfill: vi.fn(),
    OpenRouterPhaseRateLimitError: MockRateLimitError,
    runOpenRouterPhaseCall: vi.fn(),
  };
});

const promptMocks = vi.hoisted(() => ({
  buildReviewPrompt: vi.fn(),
  buildSynthesisPrompt: vi.fn(),
  formatPhaseTwoEvaluationContent: vi.fn(),
  parsePhaseTwoEvaluationArtifact: vi.fn(),
  parsePhaseTwoEvaluationResponse: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@the-seven/contracts", async () => {
  const actual =
    await vi.importActual<typeof import("@the-seven/contracts")>("@the-seven/contracts");
  return {
    ...actual,
    sessionSnapshotSchema: {
      parse: (value: unknown) => value,
    },
  };
});

vi.mock("@the-seven/db", () => dbMocks);
vi.mock("../domain/jobCredential", () => credentialMocks);
vi.mock("../domain/sessionSnapshot", () => snapshotMocks);
vi.mock("./openrouterBilling", () => ({
  scheduleSessionCostBackfill: runMocks.scheduleSessionCostBackfill,
}));
vi.mock("./openrouterRun", () => ({
  OpenRouterPhaseRateLimitError: runMocks.OpenRouterPhaseRateLimitError,
  runOpenRouterPhaseCall: runMocks.runOpenRouterPhaseCall,
}));
vi.mock("./prompts", () => promptMocks);

async function loadWorkflow() {
  return import("./orchestrateSession");
}

function buildSession(status: "completed" | "pending" | "failed" | "processing" = "pending") {
  return {
    id: 41,
    status,
    snapshotJson: {
      userMessage: "How should we launch?",
      council: {
        members: [1, 2, 3, 4, 5, 6, 7].map((memberPosition) => ({
          memberPosition,
          model: { modelId: `model-${memberPosition}` },
          tuning: null,
        })),
      },
    },
  };
}

function phaseTwoReview(candidateId: string, score: number) {
  return {
    score,
    strengths: [`Candidate ${candidateId} identifies concrete support.`],
    weaknesses: [`Candidate ${candidateId} misses a concrete caveat.`],
    critical_errors: [],
    missing_evidence: [],
    verdict_input: `Candidate ${candidateId} should inform the final verdict.`,
  };
}

describe("orchestrateClaimedJob", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of [
      dbMocks.createSessionArtifact,
      dbMocks.getSessionArtifact,
      dbMocks.getSessionById,
      dbMocks.listSessionArtifacts,
      dbMocks.markClaimedSessionCompleted,
      dbMocks.markClaimedSessionFailed,
      dbMocks.markJobCompleted,
      dbMocks.markJobFailed,
      dbMocks.refreshSessionUsageTotals,
      dbMocks.startClaimedSessionProcessing,
      dbMocks.verifyActiveClaimedJobLease,
      snapshotMocks.buildSystemPromptForPhase,
      snapshotMocks.getSnapshotMember,
      credentialMocks.decryptJobCredential,
      runMocks.scheduleSessionCostBackfill,
      runMocks.runOpenRouterPhaseCall,
      promptMocks.buildReviewPrompt,
      promptMocks.buildSynthesisPrompt,
      promptMocks.formatPhaseTwoEvaluationContent,
      promptMocks.parsePhaseTwoEvaluationArtifact,
      promptMocks.parsePhaseTwoEvaluationResponse,
    ]) {
      mock.mockReset();
    }

    dbMocks.refreshSessionUsageTotals.mockResolvedValue(undefined);
    dbMocks.markClaimedSessionCompleted.mockResolvedValue(undefined);
    dbMocks.markClaimedSessionFailed.mockResolvedValue(undefined);
    dbMocks.markJobCompleted.mockResolvedValue(undefined);
    dbMocks.markJobFailed.mockResolvedValue(undefined);
    dbMocks.startClaimedSessionProcessing.mockResolvedValue(true);
    dbMocks.verifyActiveClaimedJobLease.mockResolvedValue(undefined);
    snapshotMocks.buildSystemPromptForPhase.mockReturnValue("prompt");
    snapshotMocks.getSnapshotMember.mockImplementation(
      (
        snapshot: {
          council: { members: Array<{ memberPosition: number; model: { modelId: string } }> };
        },
        memberPosition: number,
      ) => snapshot.council.members.find((member) => member.memberPosition === memberPosition),
    );
    credentialMocks.decryptJobCredential.mockReturnValue("api-key");
    promptMocks.buildReviewPrompt.mockReturnValue("review-prompt");
    promptMocks.buildSynthesisPrompt.mockReturnValue("synthesis-prompt");
    const evaluation = {
      ranking: ["A", "B", "C", "D", "E", "F"],
      reviews: {
        A: phaseTwoReview("A", 100),
        B: phaseTwoReview("B", 90),
        C: phaseTwoReview("C", 80),
        D: phaseTwoReview("D", 70),
        E: phaseTwoReview("E", 60),
        F: phaseTwoReview("F", 50),
      },
      best_final_answer_inputs: ["Keep the strongest factual basis."],
      major_disagreements: [],
    };
    promptMocks.parsePhaseTwoEvaluationArtifact.mockReturnValue({
      ok: true,
      evaluation,
    });
    promptMocks.parsePhaseTwoEvaluationResponse.mockReturnValue({
      ok: true,
      evaluation,
    });
    promptMocks.formatPhaseTwoEvaluationContent.mockReturnValue("canonical-evaluation-json\n");
    runMocks.runOpenRouterPhaseCall.mockImplementation(
      async ({ phase, memberPosition }: { phase: number; memberPosition: number }) => ({
        ok: true as const,
        content: `phase-${phase}-${memberPosition}`,
      }),
    );
  });

  test("completes jobs immediately for already-completed sessions", async () => {
    dbMocks.getSessionById.mockResolvedValue(buildSession("completed"));

    const { orchestrateClaimedJob } = await loadWorkflow();
    await orchestrateClaimedJob({
      jobId: 5,
      leaseOwner: "worker:1",
      sessionId: 41,
      credentialCiphertext: "ciphertext",
    });

    expect(dbMocks.markClaimedSessionCompleted).toHaveBeenCalledWith({
      sessionId: 41,
      jobId: 5,
      leaseOwner: "worker:1",
    });
    expect(dbMocks.refreshSessionUsageTotals).not.toHaveBeenCalled();
    expect(dbMocks.markJobCompleted).not.toHaveBeenCalled();
    expect(runMocks.runOpenRouterPhaseCall).not.toHaveBeenCalled();
  });

  test("fails fast when the claimed job has no encrypted credential", async () => {
    dbMocks.getSessionById.mockResolvedValue(buildSession("pending"));

    const { orchestrateClaimedJob } = await loadWorkflow();
    await orchestrateClaimedJob({
      jobId: 6,
      leaseOwner: "worker:2",
      sessionId: 41,
      credentialCiphertext: null,
    });

    expect(dbMocks.markClaimedSessionFailed).toHaveBeenCalledWith({
      sessionId: 41,
      jobId: 6,
      leaseOwner: "worker:2",
      failureKind: "server_restart",
      lastError: "Missing encrypted job credential",
    });
    expect(dbMocks.markJobFailed).not.toHaveBeenCalled();
  });

  test("lost leases abort before provider execution", async () => {
    dbMocks.getSessionById.mockResolvedValue(buildSession("pending"));
    dbMocks.verifyActiveClaimedJobLease.mockRejectedValue(new dbMocks.ClaimedJobLeaseLostError());

    const { orchestrateClaimedJob } = await loadWorkflow();
    await expect(
      orchestrateClaimedJob({
        jobId: 31,
        leaseOwner: "worker:lost",
        sessionId: 41,
        credentialCiphertext: "ciphertext",
      }),
    ).rejects.toThrow("Claimed job lease lost");

    expect(runMocks.runOpenRouterPhaseCall).not.toHaveBeenCalled();
    expect(dbMocks.createSessionArtifact).not.toHaveBeenCalled();
    expect(dbMocks.markClaimedSessionFailed).not.toHaveBeenCalled();
    expect(dbMocks.startClaimedSessionProcessing).not.toHaveBeenCalled();
  });

  test("lost leases abort after provider execution before artifact writes", async () => {
    const artifacts: Array<{
      sessionId: number;
      phase: number;
      artifactKind: "response" | "review" | "synthesis";
      memberPosition: number;
      modelId: string;
      content: string;
    }> = [];
    dbMocks.getSessionById.mockResolvedValue(buildSession("pending"));
    dbMocks.getSessionArtifact.mockResolvedValue(null);
    dbMocks.listSessionArtifacts.mockImplementation(async () =>
      artifacts.map((artifact, index) => ({
        ...artifact,
        id: index + 1,
        createdAt: new Date("2026-04-02T12:00:00.000Z"),
      })),
    );
    dbMocks.verifyActiveClaimedJobLease
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new dbMocks.ClaimedJobLeaseLostError());

    const { orchestrateClaimedJob } = await loadWorkflow();
    await expect(
      orchestrateClaimedJob({
        jobId: 32,
        leaseOwner: "worker:lost",
        sessionId: 41,
        credentialCiphertext: "ciphertext",
      }),
    ).rejects.toThrow("Claimed job lease lost");

    expect(runMocks.runOpenRouterPhaseCall).toHaveBeenCalled();
    expect(runMocks.runOpenRouterPhaseCall.mock.calls[0]?.[0]).toMatchObject({
      phase: 1,
      claimedLease: { sessionId: 41, jobId: 32, leaseOwner: "worker:lost" },
    });
    expect(dbMocks.createSessionArtifact).not.toHaveBeenCalled();
    expect(dbMocks.markClaimedSessionFailed).not.toHaveBeenCalled();
  });

  test("resumes from existing phase-one artifacts instead of rerunning them", async () => {
    const artifacts: Array<{
      sessionId: number;
      phase: number;
      artifactKind: "response" | "review" | "synthesis";
      memberPosition: number;
      modelId: string;
      content: string;
    }> = [1, 2, 3, 4, 5].map((memberPosition) => ({
      sessionId: 41,
      phase: 1,
      artifactKind: "response",
      memberPosition,
      modelId: `model-${memberPosition}`,
      content: `existing-${memberPosition}`,
    }));

    dbMocks.getSessionById.mockResolvedValue(buildSession("pending"));
    dbMocks.getSessionArtifact.mockResolvedValue(null);
    dbMocks.listSessionArtifacts.mockImplementation(async () =>
      artifacts.map((artifact, index) => ({
        ...artifact,
        id: index + 1,
        createdAt: new Date("2026-04-02T12:00:00.000Z"),
      })),
    );
    dbMocks.createSessionArtifact.mockImplementation(async (input) => {
      artifacts.push({
        sessionId: input.sessionId,
        phase: input.phase,
        artifactKind: input.artifactKind,
        memberPosition: input.memberPosition,
        modelId: input.modelId,
        content: input.content,
      });
    });

    const { orchestrateClaimedJob } = await loadWorkflow();
    await orchestrateClaimedJob({
      jobId: 7,
      leaseOwner: "worker:3",
      sessionId: 41,
      credentialCiphertext: "ciphertext",
    });

    expect(credentialMocks.decryptJobCredential).toHaveBeenCalledWith("ciphertext", {
      sessionId: 41,
      jobId: 7,
    });
    const phaseOneCalls = runMocks.runOpenRouterPhaseCall.mock.calls.filter(
      ([input]) => input.phase === 1,
    );
    expect(phaseOneCalls).toHaveLength(1);
    expect(phaseOneCalls[0]?.[0]).toMatchObject({
      phase: 1,
      memberPosition: 6,
      modelId: "model-6",
    });
    expect(dbMocks.markClaimedSessionCompleted).toHaveBeenCalledWith({
      sessionId: 41,
      jobId: 7,
      leaseOwner: "worker:3",
    });
    expect(runMocks.scheduleSessionCostBackfill).toHaveBeenCalledWith({
      sessionId: 41,
      apiKey: "api-key",
    });
  });
});
