import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { getDb } from "../client";
import { jobs, sessions } from "../schema";
import { setupTestDatabase, teardownTestDatabase } from "../testDb";
import { claimRunnableJobs, markClaimedSessionFailed, requeueFailedSessionJob } from "./jobs";
import { createQueuedSession } from "./jobsTestHelpers";
import { getSessionById } from "./sessions";

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

describe("failed session requeue queries", () => {
  beforeEach(async () => {
    await setupTestDatabase();
  });

  afterEach(async () => {
    await teardownTestDatabase();
  });

  test("requeueing a failed session is atomic with credential materialization", async () => {
    const sessionId = await createQueuedSession();
    const claimed = await claimOne(sessionId);
    if (!claimed) throw new Error("Expected one claimed job");
    await markClaimedSessionFailed({
      sessionId,
      jobId: claimed.id,
      leaseOwner: claimed.leaseOwner,
      failureKind: "phase2_inference_failed",
      lastError: "provider failed",
    });

    await expect(
      requeueFailedSessionJob({
        sessionId,
        buildCredentialCiphertext: () => {
          throw new Error("encryption failed");
        },
      }),
    ).rejects.toThrow("encryption failed");

    const failedSession = await getSessionById(sessionId);
    expect(failedSession?.status).toBe("failed");
    expect(failedSession?.failureKind).toBe("phase2_inference_failed");
    const db = await getDb();
    const rowsAfterFailure = await db.select().from(jobs).where(eq(jobs.sessionId, sessionId));
    expect(rowsAfterFailure[0]?.state).toBe("failed");
    expect(rowsAfterFailure[0]?.credentialCiphertext).toBeNull();

    await requeueFailedSessionJob({
      sessionId,
      buildCredentialCiphertext: ({ sessionId: credentialSessionId, jobId }) =>
        `cipher:${credentialSessionId}:${jobId}`,
    });

    const pendingSession = await getSessionById(sessionId);
    expect(pendingSession?.status).toBe("pending");
    expect(pendingSession?.failureKind).toBeNull();
    const rowsAfterSuccess = await db.select().from(jobs).where(eq(jobs.sessionId, sessionId));
    expect(rowsAfterSuccess[0]?.state).toBe("queued");
    expect(rowsAfterSuccess[0]?.credentialCiphertext).toBe(`cipher:${sessionId}:${claimed.id}`);
  });

  test("requeueing requires a failed session", async () => {
    const sessionId = await createQueuedSession();

    await expect(
      requeueFailedSessionJob({
        sessionId,
        buildCredentialCiphertext: () => "ciphertext",
      }),
    ).rejects.toThrow("Expected claimed row for sessions.requeue_failed");

    const db = await getDb();
    const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    expect(rows[0]?.status).toBe("pending");
  });
});
