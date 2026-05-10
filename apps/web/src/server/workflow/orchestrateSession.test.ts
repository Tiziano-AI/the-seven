import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  createSessionArtifact: vi.fn(),
  getSessionArtifact: vi.fn(),
  getSessionById: vi.fn(),
  listSessionArtifacts: vi.fn(),
  markJobCompleted: vi.fn(),
  markJobFailed: vi.fn(),
  markSessionCompleted: vi.fn(),
  markSessionFailed: vi.fn(),
  refreshSessionUsageTotals: vi.fn(),
  startSessionProcessing: vi.fn(),
}));

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
    backfillSessionCosts: vi.fn(),
    OpenRouterPhaseRateLimitError: MockRateLimitError,
    runOpenRouterPhaseCall: vi.fn(),
  };
});

const promptMocks = vi.hoisted(() => ({
  buildReviewPrompt: vi.fn(),
  buildSynthesisPrompt: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@the-seven/contracts", () => ({
  REVIEWER_MEMBER_POSITIONS: [1, 2, 3, 4, 5, 6],
  SYNTHESIZER_MEMBER_POSITION: 7,
  isReviewerMemberPosition: (value: number) => value >= 1 && value <= 6,
  sessionSnapshotSchema: {
    parse: (value: unknown) => value,
  },
}));

vi.mock("@the-seven/db", () => dbMocks);
vi.mock("../domain/jobCredential", () => credentialMocks);
vi.mock("../domain/sessionSnapshot", () => snapshotMocks);
vi.mock("./openrouterRun", () => runMocks);
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

describe("orchestrateClaimedJob", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of [
      dbMocks.createSessionArtifact,
      dbMocks.getSessionArtifact,
      dbMocks.getSessionById,
      dbMocks.listSessionArtifacts,
      dbMocks.markJobCompleted,
      dbMocks.markJobFailed,
      dbMocks.markSessionCompleted,
      dbMocks.markSessionFailed,
      dbMocks.refreshSessionUsageTotals,
      dbMocks.startSessionProcessing,
      snapshotMocks.buildSystemPromptForPhase,
      snapshotMocks.getSnapshotMember,
      credentialMocks.decryptJobCredential,
      runMocks.backfillSessionCosts,
      runMocks.runOpenRouterPhaseCall,
      promptMocks.buildReviewPrompt,
      promptMocks.buildSynthesisPrompt,
    ]) {
      mock.mockReset();
    }

    dbMocks.refreshSessionUsageTotals.mockResolvedValue(undefined);
    dbMocks.markJobCompleted.mockResolvedValue(undefined);
    dbMocks.markJobFailed.mockResolvedValue(undefined);
    dbMocks.markSessionCompleted.mockResolvedValue(undefined);
    dbMocks.markSessionFailed.mockResolvedValue(undefined);
    dbMocks.startSessionProcessing.mockResolvedValue(true);
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

    expect(dbMocks.refreshSessionUsageTotals).toHaveBeenCalledWith(41);
    expect(dbMocks.markJobCompleted).toHaveBeenCalledWith({
      jobId: 5,
      leaseOwner: "worker:1",
    });
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

    expect(dbMocks.markSessionFailed).toHaveBeenCalledWith(41, "server_restart");
    expect(dbMocks.markJobFailed).toHaveBeenCalledWith({
      jobId: 6,
      leaseOwner: "worker:2",
      lastError: "Missing encrypted job credential",
    });
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
    expect(dbMocks.markSessionCompleted).toHaveBeenCalledWith(41);
    expect(dbMocks.markJobCompleted).toHaveBeenCalledWith({
      jobId: 7,
      leaseOwner: "worker:3",
    });
    expect(runMocks.backfillSessionCosts).toHaveBeenCalledWith({
      sessionId: 41,
      apiKey: "api-key",
    });
  });
});
