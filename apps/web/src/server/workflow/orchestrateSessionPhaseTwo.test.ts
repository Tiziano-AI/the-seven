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

type StoredArtifact = Readonly<{
  sessionId: number;
  phase: number;
  artifactKind: "response" | "review" | "synthesis";
  memberPosition: number;
  modelId: string;
  content: string;
}>;

type SynthesisPayload = Readonly<{
  schema_version: number;
  reviewer_summaries: ReadonlyArray<
    Readonly<{
      reviewer_id: string;
      ranking: string[];
      best_final_answer_inputs: string[];
      candidate_verdicts: {
        A: { score: number; verdict_input: string };
      };
    }>
  >;
}>;

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

function phaseTwoProviderResponse(offset: number) {
  return JSON.stringify({
    reviews: [
      { candidate_id: "C", ...phaseTwoReview("C", 80 + offset) },
      { candidate_id: "A", ...phaseTwoReview("A", 10 + offset) },
      { candidate_id: "F", ...phaseTwoReview("F", 50 + offset) },
      { candidate_id: "B", ...phaseTwoReview("B", 60 + offset) },
      { candidate_id: "E", ...phaseTwoReview("E", 70 + offset) },
      { candidate_id: "D", ...phaseTwoReview("D", 30 + offset) },
    ],
    best_final_answer_inputs: [`Reviewer ${offset} keeps concrete factual support.`],
    major_disagreements: [],
  });
}

function payloadFromPrompt(text: string): SynthesisPayload {
  const start = text.indexOf("{");
  if (start < 0) {
    throw new Error("Prompt did not contain a JSON payload");
  }
  return JSON.parse(text.slice(start)) as SynthesisPayload;
}

describe("orchestrateClaimedJob phase-two artifacts", () => {
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

  test("round-trips unordered provider phase-two rows into stored evaluations for synthesis", async () => {
    const artifacts: StoredArtifact[] = [];

    dbMocks.getSessionById.mockResolvedValue(buildSession());
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
    runMocks.runOpenRouterPhaseCall.mockImplementation(
      async ({ phase, memberPosition }: { phase: number; memberPosition: number }) => {
        if (phase === 2) {
          return {
            ok: true as const,
            content: phaseTwoProviderResponse(memberPosition),
          };
        }
        return {
          ok: true as const,
          content: `phase-${phase}-${memberPosition}`,
        };
      },
    );

    const { orchestrateClaimedJob } = await import("./orchestrateSession");
    await orchestrateClaimedJob({
      jobId: 8,
      leaseOwner: "worker:4",
      sessionId: 41,
      credentialCiphertext: "ciphertext",
    });

    const reviewArtifacts = artifacts.filter((artifact) => artifact.artifactKind === "review");
    expect(reviewArtifacts).toHaveLength(6);
    expect(JSON.parse(reviewArtifacts[0]?.content ?? "{}")).toMatchObject({
      ranking: ["C", "E", "B", "F", "D", "A"],
      best_final_answer_inputs: ["Reviewer 1 keeps concrete factual support."],
    });

    const phaseThreeCall = runMocks.runOpenRouterPhaseCall.mock.calls.find(
      ([input]) => input.phase === 3,
    );
    expect(phaseThreeCall?.[0]).toMatchObject({
      phase: 3,
      memberPosition: 7,
    });
    const synthesisMessage = phaseThreeCall?.[0].messages[1]?.content;
    if (typeof synthesisMessage !== "string") throw new Error("Missing phase-3 synthesis prompt");
    const payload = payloadFromPrompt(synthesisMessage);
    expect(payload.schema_version).toBe(2);
    expect(payload.reviewer_summaries).toHaveLength(6);
    expect(payload.reviewer_summaries[0]).toMatchObject({
      reviewer_id: "R1",
      ranking: ["C", "E", "B", "F", "D", "A"],
      best_final_answer_inputs: ["Reviewer 1 keeps concrete factual support."],
      candidate_verdicts: {
        A: { score: 11, verdict_input: "Candidate A should inform the final verdict." },
      },
    });
    expect(JSON.stringify(payload)).not.toContain("identifies concrete support");
    expect(JSON.stringify(payload)).not.toContain("misses a concrete caveat");
    expect(dbMocks.markClaimedSessionCompleted).toHaveBeenCalledWith({
      sessionId: 41,
      jobId: 8,
      leaseOwner: "worker:4",
    });
  });
});
