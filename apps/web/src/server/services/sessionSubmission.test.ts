import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  createSessionWithJob: vi.fn(),
  getSessionById: vi.fn(),
  requeueFailedSessionJob: vi.fn(),
}));

const attachmentMocks = vi.hoisted(() => ({
  decodeAttachmentToText: vi.fn(),
}));

const credentialMocks = vi.hoisted(() => ({
  encryptJobCredential: vi.fn(),
}));

const hashMocks = vi.hoisted(() => ({
  hashQuestion: vi.fn(),
}));

const snapshotMocks = vi.hoisted(() => ({
  buildSessionSnapshot: vi.fn(),
}));

const councilMocks = vi.hoisted(() => ({
  getOutputFormats: vi.fn(),
  resolveCouncilSnapshot: vi.fn(),
}));

const demoLimitMocks = vi.hoisted(() => ({
  admitDemoRun: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@the-seven/config", () => ({
  BUILT_IN_COUNCILS: {
    commons: { name: "The Commons Council" },
  },
}));

vi.mock("@the-seven/db", () => dbMocks);
vi.mock("../domain/attachments", () => attachmentMocks);
vi.mock("../domain/jobCredential", () => credentialMocks);
vi.mock("../domain/questionHash", () => hashMocks);
vi.mock("../domain/sessionSnapshot", () => snapshotMocks);
vi.mock("./councils", () => councilMocks);
vi.mock("./demoLimits", () => demoLimitMocks);

async function loadSessionSubmission() {
  return import("./sessionSubmission");
}

describe("sessionSubmission service", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of [
      dbMocks.createSessionWithJob,
      dbMocks.getSessionById,
      dbMocks.requeueFailedSessionJob,
      attachmentMocks.decodeAttachmentToText,
      credentialMocks.encryptJobCredential,
      hashMocks.hashQuestion,
      snapshotMocks.buildSessionSnapshot,
      councilMocks.getOutputFormats,
      councilMocks.resolveCouncilSnapshot,
      demoLimitMocks.admitDemoRun,
    ]) {
      mock.mockReset();
    }

    credentialMocks.encryptJobCredential.mockReturnValue("ciphertext");
    hashMocks.hashQuestion.mockReturnValue("question-hash");
    councilMocks.getOutputFormats.mockReturnValue({
      phase1: "phase1",
      phase2: "phase2",
      phase3: "phase3",
    });
    snapshotMocks.buildSessionSnapshot.mockReturnValue({
      version: 1,
      createdAt: "2026-04-02T00:00:00.000Z",
      query: "How?",
      userMessage: "How?",
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
        members: [],
      },
    });
    councilMocks.resolveCouncilSnapshot.mockResolvedValue({
      nameAtRun: "The Founding Council",
      phasePrompts: {
        phase1: "prompt1",
        phase2: "prompt2",
        phase3: "prompt3",
      },
      members: [],
    });
    demoLimitMocks.admitDemoRun.mockResolvedValue(null);
  });

  test("rejects non-Commons demo submissions", async () => {
    const { submitSession } = await loadSessionSubmission();

    await expect(
      submitSession({
        auth: {
          kind: "demo",
          userId: 1,
          principal: "demo@example.com",
          openRouterKey: "demo-key",
        },
        ip: "127.0.0.1",
        now: new Date("2026-04-02T12:00:00.000Z"),
        ingressSource: "web",
        ingressVersion: null,
        traceId: "trace-1",
        query: "How?",
        councilRef: { kind: "built_in", slug: "founding" },
      }),
    ).rejects.toMatchObject({
      kind: "forbidden",
      status: 403,
    });
  });

  test("submits decoded text attachments into the snapshot and queued job", async () => {
    attachmentMocks.decodeAttachmentToText.mockResolvedValue({
      ok: true,
      attachment: { name: "evidence.txt", text: "alpha\nbeta" },
    });
    dbMocks.createSessionWithJob.mockResolvedValue(44);

    const { submitSession } = await loadSessionSubmission();
    const result = await submitSession({
      auth: {
        kind: "byok",
        userId: 7,
        principal: "user",
        openRouterKey: "byok-key",
      },
      ip: "127.0.0.1",
      now: new Date("2026-04-02T12:00:00.000Z"),
      ingressSource: "web",
      ingressVersion: "web@1.0.0",
      traceId: "trace-submit-attachments",
      query: "How?",
      councilRef: { kind: "built_in", slug: "founding" },
      attachments: [{ name: "evidence.txt", base64: "encoded" }],
    });

    expect(result).toEqual({ sessionId: 44 });
    expect(attachmentMocks.decodeAttachmentToText).toHaveBeenCalledWith({
      name: "evidence.txt",
      base64: "encoded",
    });
    expect(snapshotMocks.buildSessionSnapshot).toHaveBeenCalledWith({
      now: new Date("2026-04-02T12:00:00.000Z"),
      query: "How?",
      attachments: [{ name: "evidence.txt", text: "alpha\nbeta" }],
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
        members: [],
      },
    });
    expect(dbMocks.createSessionWithJob).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        query: "How?",
        attachments: [{ name: "evidence.txt", text: "alpha\nbeta" }],
        ingressSource: "web",
        ingressVersion: "web@1.0.0",
        questionHash: "question-hash",
        traceId: "trace-submit-attachments",
        buildCredentialCiphertext: expect.any(Function),
      }),
    );
    const createInput = dbMocks.createSessionWithJob.mock.calls[0]?.[0];
    expect(createInput.buildCredentialCiphertext({ sessionId: 44, jobId: 45 })).toBe("ciphertext");
    expect(credentialMocks.encryptJobCredential).toHaveBeenCalledWith("byok-key", {
      sessionId: 44,
      jobId: 45,
    });
  });

  test("denies unsupported attachments before council resolution or DB writes", async () => {
    attachmentMocks.decodeAttachmentToText.mockResolvedValue({
      ok: false,
      error: {
        kind: "unsupported_type",
        message: "Attachment evidence.txt is image/png (png), which is not a supported format.",
      },
    });

    const { submitSession } = await loadSessionSubmission();

    await expect(
      submitSession({
        auth: {
          kind: "byok",
          userId: 7,
          principal: "user",
          openRouterKey: "byok-key",
        },
        ip: "127.0.0.1",
        now: new Date("2026-04-02T12:00:00.000Z"),
        ingressSource: "web",
        ingressVersion: null,
        traceId: "trace-unsupported-attachment",
        query: "How?",
        councilRef: { kind: "built_in", slug: "founding" },
        attachments: [{ name: "evidence.txt", base64: "encoded" }],
      }),
    ).rejects.toMatchObject({
      kind: "invalid_input",
      status: 400,
      details: {
        reason: "invalid_request",
        issues: [
          {
            path: "attachments",
            message: "Attachment evidence.txt is image/png (png), which is not a supported format.",
          },
        ],
      },
    });
    expect(councilMocks.resolveCouncilSnapshot).not.toHaveBeenCalled();
    expect(snapshotMocks.buildSessionSnapshot).not.toHaveBeenCalled();
    expect(dbMocks.createSessionWithJob).not.toHaveBeenCalled();
  });

  test("continues failed sessions by requeueing the same session", async () => {
    dbMocks.getSessionById.mockResolvedValue({
      id: 12,
      userId: 7,
      status: "failed",
      councilNameAtRun: "The Founding Council",
    });

    const { continueSession } = await loadSessionSubmission();
    const result = await continueSession({
      auth: {
        kind: "byok",
        userId: 7,
        principal: "user",
        openRouterKey: "byok-key",
      },
      ip: "127.0.0.1",
      now: new Date("2026-04-02T12:00:00.000Z"),
      sessionId: 12,
    });

    expect(result).toEqual({ sessionId: 12 });
    expect(dbMocks.requeueFailedSessionJob).toHaveBeenCalledWith({
      sessionId: 12,
      buildCredentialCiphertext: expect.any(Function),
    });
    const requeueInput = dbMocks.requeueFailedSessionJob.mock.calls[0]?.[0];
    expect(requeueInput.buildCredentialCiphertext({ sessionId: 12, jobId: 99 })).toBe("ciphertext");
    expect(credentialMocks.encryptJobCredential).toHaveBeenCalledWith("byok-key", {
      sessionId: 12,
      jobId: 99,
    });
  });

  test("reruns completed sessions with overridden query and snapshot attachments", async () => {
    dbMocks.getSessionById.mockResolvedValue({
      id: 20,
      userId: 7,
      status: "completed",
      query: "Original question",
      snapshotJson: {
        attachments: [{ name: "brief.md", text: "hello" }],
      },
    });
    dbMocks.createSessionWithJob.mockResolvedValue(33);

    const { rerunSession } = await loadSessionSubmission();
    const result = await rerunSession({
      auth: {
        kind: "byok",
        userId: 7,
        principal: "user",
        openRouterKey: "byok-key",
      },
      ip: "127.0.0.1",
      now: new Date("2026-04-02T12:00:00.000Z"),
      traceId: "trace-2",
      ingressSource: "cli",
      ingressVersion: "cli@1.0.0",
      sessionId: 20,
      councilRef: { kind: "built_in", slug: "founding" },
      queryOverride: "Improved question",
    });

    expect(result).toEqual({ sessionId: 33 });
    expect(councilMocks.resolveCouncilSnapshot).toHaveBeenCalledWith({
      userId: 7,
      ref: { kind: "built_in", slug: "founding" },
    });
    expect(snapshotMocks.buildSessionSnapshot).toHaveBeenCalledWith({
      now: new Date("2026-04-02T12:00:00.000Z"),
      query: "Improved question",
      attachments: [{ name: "brief.md", text: "hello" }],
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
        members: [],
      },
    });
    expect(dbMocks.createSessionWithJob).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        query: "Improved question",
        attachments: [{ name: "brief.md", text: "hello" }],
        ingressSource: "cli",
        ingressVersion: "cli@1.0.0",
        questionHash: "question-hash",
        traceId: "trace-2",
        buildCredentialCiphertext: expect.any(Function),
      }),
    );
    expect(dbMocks.createSessionWithJob).toHaveBeenCalledTimes(1);
    expect(dbMocks.requeueFailedSessionJob).not.toHaveBeenCalled();
    expect(result.sessionId).not.toBe(20);
  });

  test("rejects rerun for non-terminal sessions", async () => {
    dbMocks.getSessionById.mockResolvedValue({
      id: 21,
      userId: 7,
      status: "processing",
      query: "Original question",
      snapshotJson: {
        attachments: [],
      },
    });

    const { rerunSession } = await loadSessionSubmission();

    await expect(
      rerunSession({
        auth: {
          kind: "byok",
          userId: 7,
          principal: "user",
          openRouterKey: "byok-key",
        },
        ip: "127.0.0.1",
        now: new Date("2026-04-02T12:00:00.000Z"),
        traceId: "trace-3",
        ingressSource: "web",
        ingressVersion: null,
        sessionId: 21,
        councilRef: { kind: "built_in", slug: "founding" },
      }),
    ).rejects.toMatchObject({
      kind: "invalid_input",
      status: 400,
    });
  });
});
