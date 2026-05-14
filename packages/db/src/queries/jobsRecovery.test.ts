import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { getDb } from "../client";
import { jobs, sessions } from "../schema";
import { setupTestDatabase, teardownTestDatabase } from "../testDb";
import { claimRunnableJobs } from "./jobs";
import { createQueuedSession } from "./jobsTestHelpers";
import { createProviderCall, getSessionById } from "./sessions";

async function claimOne(sessionId: number) {
  const rows = await claimRunnableJobs({
    leaseOwner: "worker:test",
    now: new Date("2026-05-13T12:00:00.000Z"),
    leaseExpiresAt: new Date(Date.now() + 300_000),
    limit: 1,
  });

  expect(rows).toHaveLength(1);
  expect(rows[0]?.sessionId).toBe(sessionId);
  return rows[0] ?? null;
}

async function createProviderDiagnostic(input: {
  sessionId: number;
  memberPosition: number;
  totalCostUsdMicros: number | null;
  usageTotalTokens: number;
  billingLookupStatus: "pending" | "succeeded";
}) {
  await createProviderCall({
    sessionId: input.sessionId,
    phase: 1,
    memberPosition: input.memberPosition,
    requestModelId: `provider/model-${input.memberPosition}`,
    requestMaxOutputTokens: 8192,
    requestSystemChars: 1,
    requestUserChars: 2,
    requestTotalChars: 3,
    catalogRefreshedAt: new Date("2026-05-13T12:00:00.000Z"),
    supportedParametersJson: ["max_tokens"],
    sentParametersJson: ["max_tokens"],
    sentReasoningEffort: null,
    sentProviderRequireParameters: true,
    sentProviderIgnoredProvidersJson: ["amazon-bedrock", "azure"],
    deniedParametersJson: [],
    requestStartedAt: new Date("2026-05-13T12:00:00.000Z"),
    responseCompletedAt: new Date("2026-05-13T12:00:01.000Z"),
    latencyMs: 1000,
    responseId: `generation-${input.memberPosition}`,
    responseModel: `provider/model-${input.memberPosition}`,
    billedModelId: `provider/model-${input.memberPosition}`,
    totalCostUsdMicros: input.totalCostUsdMicros,
    usagePromptTokens: 4,
    usageCompletionTokens: input.usageTotalTokens - 4,
    usageTotalTokens: input.usageTotalTokens,
    finishReason: "stop",
    nativeFinishReason: null,
    errorMessage: null,
    choiceErrorMessage: null,
    choiceErrorCode: null,
    errorStatus: null,
    errorCode: null,
    billingLookupStatus: input.billingLookupStatus,
  });
}

describe("job recovery queries", () => {
  beforeEach(async () => {
    await setupTestDatabase();
  });

  afterEach(async () => {
    await teardownTestDatabase();
  });

  test("expired jobs fail terminally after the maximum claim attempts", async () => {
    const sessionId = await createQueuedSession();
    const firstClaim = await claimOne(sessionId);
    if (!firstClaim) throw new Error("Expected one claimed job");
    const db = await getDb();
    await db.update(sessions).set({ status: "processing" }).where(eq(sessions.id, sessionId));

    await db
      .update(jobs)
      .set({ leaseExpiresAt: new Date("2026-05-13T12:00:59.000Z") })
      .where(eq(jobs.id, firstClaim.id));
    const secondClaim = await claimRunnableJobs({
      leaseOwner: "worker:second",
      now: new Date("2026-05-13T12:01:00.000Z"),
      leaseExpiresAt: new Date("2026-05-13T12:02:00.000Z"),
      limit: 1,
    });
    expect(secondClaim[0]?.attemptCount).toBe(2);

    await db
      .update(jobs)
      .set({ leaseExpiresAt: new Date("2026-05-13T12:01:59.000Z") })
      .where(eq(jobs.id, firstClaim.id));
    const thirdClaim = await claimRunnableJobs({
      leaseOwner: "worker:third",
      now: new Date("2026-05-13T12:02:00.000Z"),
      leaseExpiresAt: new Date("2026-05-13T12:03:00.000Z"),
      limit: 1,
    });
    expect(thirdClaim[0]?.attemptCount).toBe(3);

    await createProviderDiagnostic({
      sessionId,
      memberPosition: 1,
      totalCostUsdMicros: 123,
      usageTotalTokens: 10,
      billingLookupStatus: "succeeded",
    });
    await createProviderDiagnostic({
      sessionId,
      memberPosition: 2,
      totalCostUsdMicros: null,
      usageTotalTokens: 20,
      billingLookupStatus: "pending",
    });

    await db
      .update(jobs)
      .set({ leaseExpiresAt: new Date("2026-05-13T12:02:59.000Z") })
      .where(eq(jobs.id, firstClaim.id));
    const exhaustedClaim = await claimRunnableJobs({
      leaseOwner: "worker:fourth",
      now: new Date("2026-05-13T12:03:00.000Z"),
      leaseExpiresAt: new Date("2026-05-13T12:04:00.000Z"),
      limit: 1,
    });

    expect(exhaustedClaim).toEqual([]);
    const session = await getSessionById(sessionId);
    expect(session?.status).toBe("failed");
    expect(session?.failureKind).toBe("internal_error");
    expect(session?.totalTokens).toBe(30);
    expect(session?.totalCostUsdMicros).toBe(123);
    expect(session?.totalCostIsPartial).toBe(true);
    const jobRows = await db.select().from(jobs).where(eq(jobs.id, firstClaim.id));
    expect(jobRows[0]?.state).toBe("failed");
    expect(jobRows[0]?.credentialCiphertext).toBeNull();
    expect(jobRows[0]?.leaseOwner).toBeNull();
    expect(jobRows[0]?.lastError).toBe("Job lease expired after maximum attempts");
  });
});
