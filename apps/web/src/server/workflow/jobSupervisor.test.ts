import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const billingMocks = vi.hoisted(() => ({
  failAbandonedBillingLookups: vi.fn(),
}));
const dbMocks = vi.hoisted(() => {
  class MockClaimedJobLeaseLostError extends Error {
    constructor() {
      super("Claimed job lease lost");
      this.name = "ClaimedJobLeaseLostError";
    }
  }

  return {
    ClaimedJobLeaseLostError: MockClaimedJobLeaseLostError,
    claimRunnableJobs: vi.fn(),
    markJobFailed: vi.fn(),
    renewJobLease: vi.fn(),
  };
});
const workflowMocks = vi.hoisted(() => ({
  orchestrateClaimedJob: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@the-seven/config", () => ({
  JOB_LEASE_RENEW_INTERVAL_MS: 10_000,
  JOB_LEASE_SECONDS: 60,
  JOB_MAX_CONCURRENCY: 1,
  JOB_SUPERVISOR_POLL_INTERVAL_MS: 10_000,
}));
vi.mock("@the-seven/db", () => dbMocks);
vi.mock("./openrouterBilling", () => billingMocks);
vi.mock("./orchestrateSession", () => workflowMocks);

import { recoverAbandonedBillingLookups, startJobSupervisor } from "./jobSupervisor";

describe("job supervisor billing recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    billingMocks.failAbandonedBillingLookups.mockReset();
    dbMocks.claimRunnableJobs.mockReset();
    dbMocks.markJobFailed.mockReset();
    dbMocks.renewJobLease.mockReset();
    workflowMocks.orchestrateClaimedJob.mockReset();
    dbMocks.claimRunnableJobs.mockResolvedValue([]);
    workflowMocks.orchestrateClaimedJob.mockResolvedValue(undefined);
    globalThis.__sevenJobSupervisorStarted = undefined;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    globalThis.__sevenJobSupervisorStarted = undefined;
  });

  test("retries abandoned billing recovery after a transient startup failure", async () => {
    billingMocks.failAbandonedBillingLookups
      .mockRejectedValueOnce(new Error("database starting"))
      .mockResolvedValueOnce(3);

    const recovery = recoverAbandonedBillingLookups();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(recovery).resolves.toBe(3);
    expect(billingMocks.failAbandonedBillingLookups).toHaveBeenCalledTimes(2);
  });

  test("startup invokes the bounded billing recovery lifecycle", async () => {
    billingMocks.failAbandonedBillingLookups.mockResolvedValue(2);

    startJobSupervisor();
    await vi.waitFor(() => {
      expect(billingMocks.failAbandonedBillingLookups).toHaveBeenCalledTimes(1);
    });
  });

  test("supervisor retries abandoned billing recovery on a later poll after bounded failure", async () => {
    billingMocks.failAbandonedBillingLookups
      .mockRejectedValueOnce(new Error("database starting"))
      .mockRejectedValueOnce(new Error("database still starting"))
      .mockRejectedValueOnce(new Error("database not ready"))
      .mockResolvedValueOnce(4);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      startJobSupervisor();
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.waitFor(() => {
        expect(billingMocks.failAbandonedBillingLookups).toHaveBeenCalledTimes(3);
      });

      await vi.advanceTimersByTimeAsync(10_000);
      await vi.waitFor(() => {
        expect(billingMocks.failAbandonedBillingLookups).toHaveBeenCalledTimes(4);
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("unexpected claimed orchestration errors leave the leased job reclaimable", async () => {
    billingMocks.failAbandonedBillingLookups.mockResolvedValue(0);
    dbMocks.claimRunnableJobs.mockResolvedValueOnce([
      {
        id: 77,
        sessionId: 88,
        attemptCount: 1,
        credentialCiphertext: "cipher:88:77",
        leaseOwner: "worker:claim",
        leaseExpiresAt: new Date("2026-05-13T12:01:00.000Z"),
      },
    ]);
    workflowMocks.orchestrateClaimedJob.mockRejectedValue(new Error("claimed terminal rejected"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      startJobSupervisor();

      await vi.waitFor(() => {
        expect(workflowMocks.orchestrateClaimedJob).toHaveBeenCalledWith(
          expect.objectContaining({
            jobId: 77,
            leaseOwner: "worker:claim",
            sessionId: 88,
            credentialCiphertext: "cipher:88:77",
            signal: expect.any(AbortSignal),
          }),
        );
      });
      await vi.waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          "[supervisor] job 77 failed:",
          "claimed terminal rejected",
        );
      });
    } finally {
      errorSpy.mockRestore();
    }

    expect(dbMocks.markJobFailed).not.toHaveBeenCalled();
  });

  test("lease renewal failure aborts the claimed orchestration signal", async () => {
    billingMocks.failAbandonedBillingLookups.mockResolvedValue(0);
    dbMocks.claimRunnableJobs.mockResolvedValueOnce([
      {
        id: 78,
        sessionId: 89,
        attemptCount: 1,
        credentialCiphertext: "cipher:89:78",
        leaseOwner: "worker:claim",
        leaseExpiresAt: new Date("2026-05-13T12:01:00.000Z"),
      },
    ]);
    dbMocks.renewJobLease.mockRejectedValue(new Error("database unavailable"));
    let capturedSignal: AbortSignal | null = null;
    workflowMocks.orchestrateClaimedJob.mockImplementation(
      async (input: { signal?: AbortSignal }) =>
        new Promise<void>((resolve) => {
          capturedSignal = input.signal ?? null;
          input.signal?.addEventListener("abort", () => resolve(), { once: true });
        }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      startJobSupervisor();
      await vi.waitFor(() => {
        expect(capturedSignal).not.toBeNull();
      });
      await vi.advanceTimersByTimeAsync(10_000);
      await vi.waitFor(() => {
        expect(capturedSignal?.aborted).toBe(true);
      });
    } finally {
      errorSpy.mockRestore();
    }

    expect(dbMocks.markJobFailed).not.toHaveBeenCalled();
  });
});
