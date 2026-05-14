import { MEMBER_POSITIONS, parseCouncilMembers, type SessionSnapshot } from "@the-seven/contracts";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { getDb } from "../client";
import { jobs, sessions } from "../schema";
import { setupTestDatabase, teardownTestDatabase } from "../testDb";
import type { ClaimedJobLease } from "./claimedLease";
import { claimRunnableJobs, verifyActiveClaimedJobLease } from "./jobs";
import {
  createProviderCall,
  createSessionArtifact,
  createSessionWithJob,
  listProviderCalls,
  listSessionArtifacts,
  listSessionsWithPendingBilling,
  markSessionPendingBillingFailed,
  startClaimedSessionProcessing,
} from "./sessions";
import { getOrCreateUser } from "./users";

function buildSnapshot(label: string): SessionSnapshot {
  const members = parseCouncilMembers(
    MEMBER_POSITIONS.map((memberPosition) => ({
      memberPosition,
      model: { provider: "openrouter", modelId: `provider/${label}-${memberPosition}` },
      tuning: null,
    })),
  );

  return {
    version: 1,
    createdAt: "2026-05-13T00:00:00.000Z",
    query: "How should billing diagnostics recover?",
    userMessage: "How should billing diagnostics recover?",
    attachments: [],
    outputFormats: {
      phase1: "Return a concise answer.",
      phase2: "Return strict JSON.",
      phase3: "Return the final answer.",
    },
    council: {
      nameAtRun: "Billing Council",
      phasePrompts: {
        phase1: "Answer directly.",
        phase2: "Evaluate directly.",
        phase3: "Synthesize directly.",
      },
      members,
    },
  };
}

async function createQueuedSession(label: string): Promise<number> {
  const user = await getOrCreateUser({ kind: "byok", principal: `principal:${label}` });
  const sessionId = await createSessionWithJob({
    userId: user.id,
    query: "How should billing diagnostics recover?",
    attachments: [],
    snapshot: buildSnapshot(label),
    councilNameAtRun: "Billing Council",
    questionHash: `question-hash:${label}`,
    ingressSource: "api",
    ingressVersion: "test",
    traceId: `trace:${label}`,
    buildCredentialCiphertext: ({ sessionId, jobId }) => `cipher:${sessionId}:${jobId}`,
  });
  const db = await getDb();
  await db
    .update(jobs)
    .set({ nextRunAt: new Date("2026-05-13T11:59:00.000Z") })
    .where(eq(jobs.sessionId, sessionId));
  return sessionId;
}

async function createProviderDiagnostic(input: {
  sessionId: number;
  memberPosition: number;
  responseId: string | null;
  billingLookupStatus: "not_requested" | "pending" | "succeeded" | "failed";
  claimedLease?: ClaimedJobLease;
}) {
  await createProviderCall({
    sessionId: input.sessionId,
    phase: 1,
    memberPosition: input.memberPosition,
    requestModelId: `provider/model-${input.memberPosition}`,
    requestMaxOutputTokens: 8_192,
    requestSystemChars: 1,
    requestUserChars: 1,
    requestTotalChars: 2,
    catalogRefreshedAt: new Date("2026-05-13T00:00:00.000Z"),
    supportedParametersJson: ["max_tokens"],
    sentParametersJson: ["max_tokens"],
    sentReasoningEffort: null,
    sentProviderRequireParameters: true,
    sentProviderIgnoredProvidersJson: ["amazon-bedrock", "azure"],
    deniedParametersJson: [],
    requestStartedAt: new Date("2026-05-13T00:00:00.000Z"),
    responseCompletedAt: new Date("2026-05-13T00:00:01.000Z"),
    latencyMs: 1_000,
    responseId: input.responseId,
    responseModel: input.responseId === null ? null : "provider/model",
    billedModelId: input.responseId === null ? null : "provider/model",
    totalCostUsdMicros: null,
    usagePromptTokens: null,
    usageCompletionTokens: null,
    usageTotalTokens: null,
    finishReason: input.responseId === null ? null : "stop",
    nativeFinishReason: null,
    errorMessage: null,
    choiceErrorMessage: null,
    choiceErrorCode: null,
    errorStatus: null,
    errorCode: null,
    billingLookupStatus: input.billingLookupStatus,
    claimedLease: input.claimedLease,
  });
}

async function setSessionStatus(
  sessionId: number,
  status: "pending" | "processing" | "completed" | "failed",
) {
  const db = await getDb();
  await db.update(sessions).set({ status }).where(eq(sessions.id, sessionId));
}

async function leaseSessionJob(sessionId: number) {
  const db = await getDb();
  await db
    .update(jobs)
    .set({
      state: "leased",
      leaseOwner: "worker:active",
      leaseExpiresAt: new Date(Date.now() + 300_000),
    })
    .where(eq(jobs.sessionId, sessionId));
}

async function claimSession(sessionId: number): Promise<ClaimedJobLease> {
  const rows = await claimRunnableJobs({
    leaseOwner: "worker:side-effect",
    now: new Date("2026-05-13T12:00:00.000Z"),
    leaseExpiresAt: new Date(Date.now() + 300_000),
    limit: 1,
  });
  expect(rows[0]?.sessionId).toBe(sessionId);
  const row = rows[0];
  if (!row) throw new Error("Expected claimed job");
  return { sessionId, jobId: row.id, leaseOwner: row.leaseOwner };
}

describe("session provider diagnostics queries", () => {
  beforeEach(async () => {
    await setupTestDatabase();
  });

  afterEach(async () => {
    await teardownTestDatabase();
  });

  test("terminalizes only abandoned pending billing rows with response IDs", async () => {
    const sessionId = await createQueuedSession("pending");
    const processingSessionId = await createQueuedSession("processing");
    const leasedSessionId = await createQueuedSession("leased");
    const otherSessionId = await createQueuedSession("other");
    await setSessionStatus(sessionId, "completed");
    await setSessionStatus(processingSessionId, "processing");
    await setSessionStatus(leasedSessionId, "processing");
    await leaseSessionJob(leasedSessionId);
    await createProviderDiagnostic({
      sessionId,
      memberPosition: 1,
      responseId: "generation-pending",
      billingLookupStatus: "pending",
    });
    await createProviderDiagnostic({
      sessionId,
      memberPosition: 2,
      responseId: null,
      billingLookupStatus: "pending",
    });
    await createProviderDiagnostic({
      sessionId,
      memberPosition: 3,
      responseId: "generation-succeeded",
      billingLookupStatus: "succeeded",
    });
    await createProviderDiagnostic({
      sessionId,
      memberPosition: 4,
      responseId: null,
      billingLookupStatus: "not_requested",
    });
    await createProviderDiagnostic({
      sessionId: otherSessionId,
      memberPosition: 1,
      responseId: null,
      billingLookupStatus: "pending",
    });
    await createProviderDiagnostic({
      sessionId: processingSessionId,
      memberPosition: 1,
      responseId: "generation-processing",
      billingLookupStatus: "pending",
    });
    await createProviderDiagnostic({
      sessionId: leasedSessionId,
      memberPosition: 1,
      responseId: "generation-leased",
      billingLookupStatus: "pending",
    });

    expect(await listSessionsWithPendingBilling()).toEqual([sessionId]);
    expect(await markSessionPendingBillingFailed(sessionId)).toBe(1);

    const calls = await listProviderCalls(sessionId);
    expect(calls.map((call) => [call.memberPosition, call.billingLookupStatus])).toEqual([
      [1, "failed"],
      [2, "pending"],
      [3, "succeeded"],
      [4, "not_requested"],
    ]);
    expect(
      (await listProviderCalls(processingSessionId)).map((call) => call.billingLookupStatus),
    ).toEqual(["pending"]);
    expect(
      (await listProviderCalls(leasedSessionId)).map((call) => call.billingLookupStatus),
    ).toEqual(["pending"]);
    expect(await listSessionsWithPendingBilling()).toEqual([]);
  });

  test("side-effect writes require the active claimed lease", async () => {
    const sessionId = await createQueuedSession("lease");
    const claimedLease = await claimSession(sessionId);

    await expect(
      verifyActiveClaimedJobLease({
        ...claimedLease,
        now: new Date("2026-05-13T12:00:30.000Z"),
      }),
    ).resolves.toBeUndefined();
    await createSessionArtifact({
      sessionId,
      phase: 1,
      artifactKind: "response",
      memberPosition: 1,
      modelId: "provider/model",
      content: "response",
      claimedLease,
    });
    await createProviderDiagnostic({
      sessionId,
      memberPosition: 1,
      responseId: "generation-active",
      billingLookupStatus: "pending",
      claimedLease,
    });

    const expiredLease = {
      ...claimedLease,
      leaseOwner: "worker:expired",
    };
    await expect(
      createSessionArtifact({
        sessionId,
        phase: 1,
        artifactKind: "response",
        memberPosition: 2,
        modelId: "provider/model",
        content: "response",
        claimedLease: expiredLease,
      }),
    ).rejects.toThrow("Claimed job lease lost");
    await expect(
      createProviderDiagnostic({
        sessionId,
        memberPosition: 2,
        responseId: "generation-expired",
        billingLookupStatus: "pending",
        claimedLease: expiredLease,
      }),
    ).rejects.toThrow("Claimed job lease lost");

    const artifacts = await listSessionArtifacts(sessionId);
    expect(artifacts.map((artifact) => artifact.memberPosition)).toEqual([1]);
    expect((await listProviderCalls(sessionId)).map((call) => call.memberPosition)).toEqual([1]);
  });

  test("processing transition requires the active claimed lease", async () => {
    const sessionId = await createQueuedSession("processing-lease");
    const claimedLease = await claimSession(sessionId);

    await expect(startClaimedSessionProcessing(claimedLease)).resolves.toBe(true);
    await setSessionStatus(sessionId, "pending");

    const rejected = await startClaimedSessionProcessing({
      ...claimedLease,
      leaseOwner: "worker:other",
    });

    expect(rejected).toBe(false);
    const db = await getDb();
    const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    expect(rows[0]?.status).toBe("pending");
  });
});
