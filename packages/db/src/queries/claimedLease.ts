const CLAIMED_JOB_LEASE_BRAND: unique symbol = Symbol("ClaimedJobLease");

export type ClaimedJobLeaseIdentity = Readonly<{
  sessionId: number;
  jobId: number;
  leaseOwner: string;
}>;

export type ClaimedJobLease = ClaimedJobLeaseIdentity &
  Readonly<{
    [CLAIMED_JOB_LEASE_BRAND]: "ClaimedJobLease";
  }>;

export function buildClaimedLease(input: ClaimedJobLeaseIdentity): ClaimedJobLease {
  return {
    sessionId: input.sessionId,
    jobId: input.jobId,
    leaseOwner: input.leaseOwner,
    [CLAIMED_JOB_LEASE_BRAND]: "ClaimedJobLease",
  };
}

/**
 * Signals that a worker no longer owns the claimed job lease required to write
 * session artifacts, provider diagnostics, or terminal job/session state.
 */
export class ClaimedJobLeaseLostError extends Error {
  readonly jobId: number;
  readonly sessionId: number;
  readonly leaseOwner: string;

  constructor(input: ClaimedJobLeaseIdentity & { reason: string }) {
    super(`Claimed job lease lost for job ${input.jobId}: ${input.reason}`);
    this.name = "ClaimedJobLeaseLostError";
    this.jobId = input.jobId;
    this.sessionId = input.sessionId;
    this.leaseOwner = input.leaseOwner;
  }
}
