import "server-only";

import { randomUUID } from "node:crypto";
import {
  JOB_LEASE_RENEW_INTERVAL_MS,
  JOB_LEASE_SECONDS,
  JOB_MAX_CONCURRENCY,
  JOB_SUPERVISOR_POLL_INTERVAL_MS,
} from "@the-seven/config";
import { ClaimedJobLeaseLostError, claimRunnableJobs, renewJobLease } from "@the-seven/db";
import { redactErrorMessage } from "../domain/redaction";
import { failAbandonedBillingLookups } from "./openrouterBilling";
import { orchestrateClaimedJob } from "./orchestrateSession";

type ClaimedJob = Awaited<ReturnType<typeof claimRunnableJobs>>[number];

const BILLING_RECOVERY_MAX_ATTEMPTS = 3;
const BILLING_RECOVERY_RETRY_DELAY_MS = 1_000;

declare global {
  var __sevenJobSupervisorStarted: boolean | undefined;
}

let billingRecoveryComplete = false;
let billingRecoveryActive: Promise<void> | null = null;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildLeaseExpiresAt(now: Date) {
  return new Date(now.getTime() + JOB_LEASE_SECONDS * 1000);
}

function formatError(error: unknown): string {
  return redactErrorMessage(error, String(error));
}

async function runClaimedJob(job: ClaimedJob) {
  const controller = new AbortController();
  const interval = setInterval(() => {
    renewJobLease({
      jobId: job.id,
      leaseOwner: job.leaseOwner,
      leaseExpiresAt: buildLeaseExpiresAt(new Date()),
    }).catch((error) => {
      console.error(`[supervisor] lease renewal failed for job ${job.id}:`, formatError(error));
      controller.abort(
        new ClaimedJobLeaseLostError({
          sessionId: job.sessionId,
          jobId: job.id,
          leaseOwner: job.leaseOwner,
          reason: "lease renewal failed",
        }),
      );
    });
  }, JOB_LEASE_RENEW_INTERVAL_MS);
  interval.unref();

  try {
    await orchestrateClaimedJob({
      jobId: job.id,
      leaseOwner: job.leaseOwner,
      sessionId: job.sessionId,
      credentialCiphertext: job.credentialCiphertext,
      signal: controller.signal,
    });
  } finally {
    clearInterval(interval);
  }
}

async function supervise() {
  const activeJobs = new Set<Promise<void>>();

  while (true) {
    try {
      scheduleAbandonedBillingRecovery();
      const availableSlots = JOB_MAX_CONCURRENCY - activeJobs.size;
      if (availableSlots > 0) {
        const now = new Date();
        const leaseOwner = `worker:${randomUUID()}`;
        const claimedJobs = await claimRunnableJobs({
          leaseOwner,
          now,
          leaseExpiresAt: buildLeaseExpiresAt(now),
          limit: availableSlots,
        });

        for (const claimedJob of claimedJobs) {
          const promise = runClaimedJob(claimedJob)
            .catch((error) => {
              console.error(`[supervisor] job ${claimedJob.id} failed:`, formatError(error));
            })
            .finally(() => {
              activeJobs.delete(promise);
            });
          activeJobs.add(promise);
        }
      }
    } catch (error) {
      console.error("[supervisor] poll error:", formatError(error));
    }

    await sleep(JOB_SUPERVISOR_POLL_INTERVAL_MS);
  }
}

function scheduleAbandonedBillingRecovery() {
  if (billingRecoveryComplete || billingRecoveryActive) {
    return;
  }

  billingRecoveryActive = recoverAbandonedBillingLookups()
    .then(() => {
      billingRecoveryComplete = true;
    })
    .catch((error) => {
      console.error("[supervisor] billing recovery failed:", formatError(error));
    })
    .finally(() => {
      billingRecoveryActive = null;
    });
}

/**
 * Terminalizes billing diagnostics left pending by a prior process. Startup owns
 * this bounded retry because a transient database failure at boot must not leave
 * abandoned request-scoped BYOK billing rows pending forever.
 */
export async function recoverAbandonedBillingLookups(): Promise<number> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= BILLING_RECOVERY_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await failAbandonedBillingLookups();
    } catch (error) {
      lastError = error;
      if (attempt < BILLING_RECOVERY_MAX_ATTEMPTS) {
        await sleep(BILLING_RECOVERY_RETRY_DELAY_MS);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Billing recovery failed");
}

export function startJobSupervisor() {
  if (globalThis.__sevenJobSupervisorStarted) {
    return;
  }

  globalThis.__sevenJobSupervisorStarted = true;
  billingRecoveryComplete = false;
  billingRecoveryActive = null;
  scheduleAbandonedBillingRecovery();
  void supervise();
}
