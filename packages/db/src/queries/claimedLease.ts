export type ClaimedJobLease = Readonly<{
  sessionId: number;
  jobId: number;
  leaseOwner: string;
}>;

/**
 * Signals that a worker no longer owns the claimed job lease required to write
 * session artifacts, provider diagnostics, or terminal job/session state.
 */
export class ClaimedJobLeaseLostError extends Error {
  readonly jobId: number;
  readonly sessionId: number;
  readonly leaseOwner: string;

  constructor(input: ClaimedJobLease & { reason: string }) {
    super(`Claimed job lease lost for job ${input.jobId}: ${input.reason}`);
    this.name = "ClaimedJobLeaseLostError";
    this.jobId = input.jobId;
    this.sessionId = input.sessionId;
    this.leaseOwner = input.leaseOwner;
  }
}
