import "server-only";

import { randomUUID } from "node:crypto";
import {
  JOB_LEASE_RENEW_INTERVAL_MS,
  JOB_LEASE_SECONDS,
  JOB_MAX_CONCURRENCY,
  JOB_SUPERVISOR_POLL_INTERVAL_MS,
} from "@the-seven/config";
import { claimRunnableJobs, renewJobLease } from "@the-seven/db";
import { orchestrateClaimedJob } from "./orchestrateSession";

type ClaimedJob = Awaited<ReturnType<typeof claimRunnableJobs>>[number];

declare global {
  var __sevenJobSupervisorStarted: boolean | undefined;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildLeaseExpiresAt(now: Date) {
  return new Date(now.getTime() + JOB_LEASE_SECONDS * 1000);
}

async function runClaimedJob(job: ClaimedJob) {
  const interval = setInterval(() => {
    void renewJobLease({
      jobId: job.id,
      leaseOwner: job.leaseOwner,
      leaseExpiresAt: buildLeaseExpiresAt(new Date()),
    });
  }, JOB_LEASE_RENEW_INTERVAL_MS);
  interval.unref();

  try {
    await orchestrateClaimedJob({
      jobId: job.id,
      leaseOwner: job.leaseOwner,
      sessionId: job.sessionId,
      credentialCiphertext: job.credentialCiphertext,
    });
  } finally {
    clearInterval(interval);
  }
}

async function supervise() {
  const activeJobs = new Set<Promise<void>>();

  while (true) {
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
        const promise = runClaimedJob(claimedJob).finally(() => {
          activeJobs.delete(promise);
        });
        activeJobs.add(promise);
      }
    }

    await sleep(JOB_SUPERVISOR_POLL_INTERVAL_MS);
  }
}

export function startJobSupervisor() {
  if (globalThis.__sevenJobSupervisorStarted) {
    return;
  }

  globalThis.__sevenJobSupervisorStarted = true;
  void supervise();
}
