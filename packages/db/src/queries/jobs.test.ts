import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { getDb } from "../client";
import { jobs, sessions } from "../schema";
import { setupTestDatabase, teardownTestDatabase } from "../testDb";
import {
  claimRunnableJobs,
  markClaimedSessionCompleted,
  markClaimedSessionFailed,
  markJobCompleted,
  markJobFailed,
  renewJobLease,
} from "./jobs";
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

describe("job lifecycle queries", () => {
  beforeEach(async () => {
    await setupTestDatabase();
  });

  afterEach(async () => {
    await teardownTestDatabase();
  });

  test("claiming ignores queued rows until credentials are materialized", async () => {
    const sessionId = await createQueuedSession();
    const db = await getDb();
    await db
      .update(jobs)
      .set({
        state: "queued",
        credentialCiphertext: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      })
      .where(eq(jobs.sessionId, sessionId));

    const rows = await claimRunnableJobs({
      leaseOwner: "worker:test",
      now: new Date("2026-05-13T12:00:00.000Z"),
      leaseExpiresAt: new Date("2026-05-13T12:01:00.000Z"),
      limit: 1,
    });

    expect(rows).toEqual([]);
  });

  test("claimed completion verifies the active lease before session terminal state", async () => {
    const sessionId = await createQueuedSession();
    const claimed = await claimOne(sessionId);
    if (!claimed) throw new Error("Expected one claimed job");

    await expect(
      markClaimedSessionCompleted({
        sessionId,
        jobId: claimed.id,
        leaseOwner: "worker:other",
      }),
    ).rejects.toThrow("Expected claimed row for jobs.complete_claimed");
    expect((await getSessionById(sessionId))?.status).toBe("pending");

    await markClaimedSessionCompleted({
      sessionId,
      jobId: claimed.id,
      leaseOwner: claimed.leaseOwner,
    });

    expect((await getSessionById(sessionId))?.status).toBe("completed");
  });

  test("claimed completion rejects a job and session mismatch", async () => {
    const sessionId = await createQueuedSession();
    const otherSessionId = await createQueuedSession();
    const claimed = await claimOne(sessionId);
    if (!claimed) throw new Error("Expected one claimed job");

    await expect(
      markClaimedSessionCompleted({
        sessionId: otherSessionId,
        jobId: claimed.id,
        leaseOwner: claimed.leaseOwner,
      }),
    ).rejects.toThrow("Expected claimed row for jobs.complete_claimed");

    expect((await getSessionById(sessionId))?.status).toBe("pending");
    expect((await getSessionById(otherSessionId))?.status).toBe("pending");
  });

  test("claimed completion requires the job to remain leased", async () => {
    const sessionId = await createQueuedSession();
    const claimed = await claimOne(sessionId);
    if (!claimed) throw new Error("Expected one claimed job");
    const db = await getDb();
    await db.update(jobs).set({ state: "queued" }).where(eq(jobs.id, claimed.id));

    await expect(
      markClaimedSessionCompleted({
        sessionId,
        jobId: claimed.id,
        leaseOwner: claimed.leaseOwner,
      }),
    ).rejects.toThrow("Expected claimed row for jobs.complete_claimed");

    expect((await getSessionById(sessionId))?.status).toBe("pending");
  });

  test("lease renewal requires the current lease to remain unexpired", async () => {
    const sessionId = await createQueuedSession();
    const claimed = await claimOne(sessionId);
    if (!claimed) throw new Error("Expected one claimed job");
    const db = await getDb();
    await db
      .update(jobs)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(jobs.id, claimed.id));

    await expect(
      renewJobLease({
        jobId: claimed.id,
        leaseOwner: claimed.leaseOwner,
        leaseExpiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow("Expected claimed row for jobs.renew_lease");

    const reclaimed = await claimRunnableJobs({
      leaseOwner: "worker:reclaimer",
      now: new Date(Date.now() + 1_000),
      leaseExpiresAt: new Date(Date.now() + 61_000),
      limit: 1,
    });

    expect(reclaimed[0]).toMatchObject({
      id: claimed.id,
      sessionId,
      attemptCount: 2,
      credentialCiphertext: `cipher:${sessionId}:${claimed.id}`,
      leaseOwner: "worker:reclaimer",
    });
  });

  test("job-only completion requires a non-expired active lease", async () => {
    const sessionId = await createQueuedSession();
    const claimed = await claimOne(sessionId);
    if (!claimed) throw new Error("Expected one claimed job");
    const db = await getDb();

    await db
      .update(jobs)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(jobs.id, claimed.id));

    await expect(
      markJobCompleted({
        jobId: claimed.id,
        leaseOwner: claimed.leaseOwner,
      }),
    ).rejects.toThrow("Expected claimed row for jobs.complete");

    const expiredRows = await db.select().from(jobs).where(eq(jobs.id, claimed.id));
    expect(expiredRows[0]?.state).toBe("leased");
    expect(expiredRows[0]?.credentialCiphertext).toBe(`cipher:${sessionId}:${claimed.id}`);

    await db
      .update(jobs)
      .set({ leaseExpiresAt: new Date(Date.now() + 60_000) })
      .where(eq(jobs.id, claimed.id));
    await markJobCompleted({ jobId: claimed.id, leaseOwner: claimed.leaseOwner });

    const completedRows = await db.select().from(jobs).where(eq(jobs.id, claimed.id));
    expect(completedRows[0]?.state).toBe("completed");
    expect(completedRows[0]?.credentialCiphertext).toBeNull();
  });

  test("job-only failure requires a non-expired active lease", async () => {
    const sessionId = await createQueuedSession();
    const claimed = await claimOne(sessionId);
    if (!claimed) throw new Error("Expected one claimed job");
    const db = await getDb();

    await db
      .update(jobs)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(jobs.id, claimed.id));

    await expect(
      markJobFailed({
        jobId: claimed.id,
        leaseOwner: claimed.leaseOwner,
        lastError: "session missing",
      }),
    ).rejects.toThrow("Expected claimed row for jobs.fail");

    const expiredRows = await db.select().from(jobs).where(eq(jobs.id, claimed.id));
    expect(expiredRows[0]?.state).toBe("leased");
    expect(expiredRows[0]?.credentialCiphertext).toBe(`cipher:${sessionId}:${claimed.id}`);

    await db
      .update(jobs)
      .set({ leaseExpiresAt: new Date(Date.now() + 60_000) })
      .where(eq(jobs.id, claimed.id));
    await markJobFailed({
      jobId: claimed.id,
      leaseOwner: claimed.leaseOwner,
      lastError: "session missing",
    });

    const failedRows = await db.select().from(jobs).where(eq(jobs.id, claimed.id));
    expect(failedRows[0]?.state).toBe("failed");
    expect(failedRows[0]?.credentialCiphertext).toBeNull();
  });

  test("claimed completion requires the lease to remain unexpired", async () => {
    const sessionId = await createQueuedSession();
    const claimed = await claimOne(sessionId);
    if (!claimed) throw new Error("Expected one claimed job");
    const db = await getDb();
    await db
      .update(jobs)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(jobs.id, claimed.id));

    await expect(
      markClaimedSessionCompleted({
        sessionId,
        jobId: claimed.id,
        leaseOwner: claimed.leaseOwner,
      }),
    ).rejects.toThrow("Expected claimed row for jobs.complete_claimed");

    expect((await getSessionById(sessionId))?.status).toBe("pending");
    const jobRows = await db.select().from(jobs).where(eq(jobs.id, claimed.id));
    expect(jobRows[0]?.state).toBe("leased");
    expect(jobRows[0]?.credentialCiphertext).toBe(`cipher:${sessionId}:${claimed.id}`);
  });

  test("claimed failure verifies the active lease before session terminal state", async () => {
    const sessionId = await createQueuedSession();
    const claimed = await claimOne(sessionId);
    if (!claimed) throw new Error("Expected one claimed job");

    await expect(
      markClaimedSessionFailed({
        sessionId,
        jobId: claimed.id,
        leaseOwner: "worker:other",
        failureKind: "phase2_inference_failed",
        lastError: "provider failed",
      }),
    ).rejects.toThrow("Expected claimed row for jobs.fail_claimed");
    expect((await getSessionById(sessionId))?.status).toBe("pending");

    await markClaimedSessionFailed({
      sessionId,
      jobId: claimed.id,
      leaseOwner: claimed.leaseOwner,
      failureKind: "phase2_inference_failed",
      lastError: "provider failed",
    });

    const session = await getSessionById(sessionId);
    expect(session?.status).toBe("failed");
    expect(session?.failureKind).toBe("phase2_inference_failed");
  });

  test("claimed failure rejects a job and session mismatch", async () => {
    const sessionId = await createQueuedSession();
    const otherSessionId = await createQueuedSession();
    const claimed = await claimOne(sessionId);
    if (!claimed) throw new Error("Expected one claimed job");

    await expect(
      markClaimedSessionFailed({
        sessionId: otherSessionId,
        jobId: claimed.id,
        leaseOwner: claimed.leaseOwner,
        failureKind: "phase2_inference_failed",
        lastError: "provider failed",
      }),
    ).rejects.toThrow("Expected claimed row for jobs.fail_claimed");

    expect((await getSessionById(sessionId))?.status).toBe("pending");
    expect((await getSessionById(otherSessionId))?.status).toBe("pending");
  });

  test("claimed failure requires the lease to remain unexpired", async () => {
    const sessionId = await createQueuedSession();
    const claimed = await claimOne(sessionId);
    if (!claimed) throw new Error("Expected one claimed job");
    const db = await getDb();
    await db
      .update(jobs)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(jobs.id, claimed.id));

    await expect(
      markClaimedSessionFailed({
        sessionId,
        jobId: claimed.id,
        leaseOwner: claimed.leaseOwner,
        failureKind: "phase2_inference_failed",
        lastError: "provider failed",
      }),
    ).rejects.toThrow("Expected claimed row for jobs.fail_claimed");

    expect((await getSessionById(sessionId))?.status).toBe("pending");
    const jobRows = await db.select().from(jobs).where(eq(jobs.id, claimed.id));
    expect(jobRows[0]?.state).toBe("leased");
    expect(jobRows[0]?.credentialCiphertext).toBe(`cipher:${sessionId}:${claimed.id}`);
  });

  test("rejected claimed failure preserves the processing session and leased job", async () => {
    const sessionId = await createQueuedSession();
    const claimed = await claimOne(sessionId);
    if (!claimed) throw new Error("Expected one claimed job");
    const db = await getDb();
    await db.update(sessions).set({ status: "processing" }).where(eq(sessions.id, sessionId));

    await expect(
      markClaimedSessionFailed({
        sessionId,
        jobId: claimed.id,
        leaseOwner: "worker:other",
        failureKind: "internal_error",
        lastError: "claimed terminal rejected",
      }),
    ).rejects.toThrow("Expected claimed row for jobs.fail_claimed");

    const session = await getSessionById(sessionId);
    expect(session?.status).toBe("processing");
    expect(session?.failureKind).toBeNull();
    const jobRows = await db.select().from(jobs).where(eq(jobs.id, claimed.id));
    expect(jobRows[0]?.state).toBe("leased");
    expect(jobRows[0]?.credentialCiphertext).toBe(`cipher:${sessionId}:${claimed.id}`);
    expect(jobRows[0]?.leaseOwner).toBe(claimed.leaseOwner);
  });

  test("expired rejected claimed failure is reclaimed with credential and new lease owner", async () => {
    const sessionId = await createQueuedSession();
    const claimed = await claimOne(sessionId);
    if (!claimed) throw new Error("Expected one claimed job");
    const db = await getDb();
    await db.update(sessions).set({ status: "processing" }).where(eq(sessions.id, sessionId));

    await expect(
      markClaimedSessionFailed({
        sessionId,
        jobId: claimed.id,
        leaseOwner: "worker:other",
        failureKind: "internal_error",
        lastError: "claimed terminal rejected",
      }),
    ).rejects.toThrow("Expected claimed row for jobs.fail_claimed");

    await db
      .update(jobs)
      .set({ leaseExpiresAt: new Date("2026-05-13T12:01:00.000Z") })
      .where(eq(jobs.id, claimed.id));

    const reclaimed = await claimRunnableJobs({
      leaseOwner: "worker:reclaimer",
      now: new Date("2026-05-13T12:01:01.000Z"),
      leaseExpiresAt: new Date("2026-05-13T12:02:01.000Z"),
      limit: 1,
    });

    expect(reclaimed).toEqual([
      {
        id: claimed.id,
        sessionId,
        attemptCount: 2,
        credentialCiphertext: `cipher:${sessionId}:${claimed.id}`,
        leaseOwner: "worker:reclaimer",
        leaseExpiresAt: new Date("2026-05-13T12:02:01.000Z"),
      },
    ]);
  });
});
