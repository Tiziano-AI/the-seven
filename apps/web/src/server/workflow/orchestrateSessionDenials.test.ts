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

async function loadWorkflow() {
  return import("./orchestrateSession");
}

function buildSession() {
  return {
    id: 41,
    status: "pending",
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

function phaseOneArtifacts() {
  return [1, 2, 3, 4, 5, 6].map((memberPosition, index) => ({
    id: index + 1,
    sessionId: 41,
    phase: 1,
    artifactKind: "response",
    memberPosition,
    modelId: `model-${memberPosition}`,
    content: `existing-${memberPosition}`,
    createdAt: new Date("2026-04-02T12:00:00.000Z"),
  }));
}

function placeholderPhaseTwoResponse() {
  const review = {
    score: 50,
    strengths: ["AAAAAAAAAAAA"],
    weaknesses: ["111111111111"],
    critical_errors: [],
    missing_evidence: [],
    verdict_input: "... ... ... ...",
  };
  return JSON.stringify({
    reviews: {
      A: review,
      B: review,
      C: review,
      D: review,
      E: review,
      F: review,
    },
    best_final_answer_inputs: ["same same same"],
    major_disagreements: [],
  });
}

describe("orchestrateClaimedJob denial transitions", () => {
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
  });

  test("fails the session instead of synthesizing from malformed phase-two provider JSON", async () => {
    const abortedMembers: number[] = [];

    dbMocks.getSessionById.mockResolvedValue(buildSession());
    dbMocks.getSessionArtifact.mockResolvedValue(null);
    dbMocks.listSessionArtifacts.mockResolvedValue(phaseOneArtifacts());
    runMocks.runOpenRouterPhaseCall.mockImplementation(
      async ({
        phase,
        memberPosition,
        signal,
      }: {
        phase: number;
        memberPosition: number;
        signal?: AbortSignal;
      }) => {
        if (phase !== 2) {
          return { ok: true, content: `phase-${phase}-${memberPosition}` };
        }
        if (memberPosition === 1) {
          return { ok: true, content: "not-json" };
        }
        return new Promise((resolve) => {
          signal?.addEventListener(
            "abort",
            () => {
              abortedMembers.push(memberPosition);
              resolve({
                ok: false,
                error: new Error(`member ${memberPosition} aborted`),
              });
            },
            { once: true },
          );
        });
      },
    );

    const { orchestrateClaimedJob } = await loadWorkflow();
    await orchestrateClaimedJob({
      jobId: 10,
      leaseOwner: "worker:6",
      sessionId: 41,
      credentialCiphertext: "ciphertext",
    });

    expect(abortedMembers.sort()).toEqual([2, 3, 4, 5, 6]);
    expect(dbMocks.createSessionArtifact).not.toHaveBeenCalledWith(
      expect.objectContaining({ artifactKind: "synthesis" }),
    );
    expect(dbMocks.createSessionArtifact).not.toHaveBeenCalledWith(
      expect.objectContaining({ artifactKind: "review", phase: 2 }),
    );
    expect(runMocks.runOpenRouterPhaseCall).not.toHaveBeenCalledWith(
      expect.objectContaining({ phase: 3 }),
    );
    expect(dbMocks.markClaimedSessionFailed).toHaveBeenCalledWith({
      sessionId: 41,
      jobId: 10,
      leaseOwner: "worker:6",
      failureKind: "phase2_inference_failed",
      lastError: "Phase 2 evaluation must be a JSON object",
    });
    expect(dbMocks.markClaimedSessionCompleted).not.toHaveBeenCalled();
  });

  test("rejects provider-success placeholder phase-two JSON before review persistence", async () => {
    const abortedMembers: number[] = [];

    dbMocks.getSessionById.mockResolvedValue(buildSession());
    dbMocks.getSessionArtifact.mockResolvedValue(null);
    dbMocks.listSessionArtifacts.mockResolvedValue(phaseOneArtifacts());
    runMocks.runOpenRouterPhaseCall.mockImplementation(
      async ({
        phase,
        memberPosition,
        signal,
      }: {
        phase: number;
        memberPosition: number;
        signal?: AbortSignal;
      }) => {
        if (phase !== 2) {
          return { ok: true, content: `phase-${phase}-${memberPosition}` };
        }
        if (memberPosition === 1) {
          return { ok: true, content: placeholderPhaseTwoResponse() };
        }
        return new Promise((resolve) => {
          signal?.addEventListener(
            "abort",
            () => {
              abortedMembers.push(memberPosition);
              resolve({
                ok: false,
                error: new Error(`member ${memberPosition} aborted`),
              });
            },
            { once: true },
          );
        });
      },
    );

    const { orchestrateClaimedJob } = await loadWorkflow();
    await orchestrateClaimedJob({
      jobId: 11,
      leaseOwner: "worker:7",
      sessionId: 41,
      credentialCiphertext: "ciphertext",
    });

    expect(abortedMembers.sort()).toEqual([2, 3, 4, 5, 6]);
    expect(dbMocks.createSessionArtifact).not.toHaveBeenCalledWith(
      expect.objectContaining({ artifactKind: "review", phase: 2 }),
    );
    expect(dbMocks.createSessionArtifact).not.toHaveBeenCalledWith(
      expect.objectContaining({ artifactKind: "synthesis" }),
    );
    expect(runMocks.runOpenRouterPhaseCall).not.toHaveBeenCalledWith(
      expect.objectContaining({ phase: 3 }),
    );
    expect(dbMocks.markClaimedSessionFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 41,
        jobId: 11,
        leaseOwner: "worker:7",
        failureKind: "phase2_inference_failed",
        lastError: expect.stringContaining("Phase 2 evaluation is invalid"),
      }),
    );
    expect(dbMocks.markClaimedSessionCompleted).not.toHaveBeenCalled();
  });

  test("aborts sibling reviewer calls when one phase-two member fails", async () => {
    const abortedMembers: number[] = [];

    dbMocks.getSessionById.mockResolvedValue(buildSession());
    dbMocks.getSessionArtifact.mockResolvedValue(null);
    dbMocks.listSessionArtifacts.mockResolvedValue(phaseOneArtifacts());
    runMocks.runOpenRouterPhaseCall.mockImplementation(
      async ({
        phase,
        memberPosition,
        signal,
      }: {
        phase: number;
        memberPosition: number;
        signal?: AbortSignal;
      }) => {
        if (phase !== 2) {
          return { ok: true, content: `phase-${phase}-${memberPosition}` };
        }
        if (memberPosition === 1) {
          return { ok: false, error: new Error("provider failed") };
        }
        return new Promise((resolve) => {
          signal?.addEventListener(
            "abort",
            () => {
              abortedMembers.push(memberPosition);
              resolve({
                ok: false,
                error: new Error(`member ${memberPosition} aborted`),
              });
            },
            { once: true },
          );
        });
      },
    );

    const { orchestrateClaimedJob } = await loadWorkflow();
    await orchestrateClaimedJob({
      jobId: 9,
      leaseOwner: "worker:5",
      sessionId: 41,
      credentialCiphertext: "ciphertext",
    });

    expect(abortedMembers.sort()).toEqual([2, 3, 4, 5, 6]);
    expect(dbMocks.markClaimedSessionFailed).toHaveBeenCalledWith({
      sessionId: 41,
      jobId: 9,
      leaseOwner: "worker:5",
      failureKind: "phase2_inference_failed",
      lastError: "provider failed",
    });
    expect(dbMocks.markClaimedSessionCompleted).not.toHaveBeenCalled();
  });
});
