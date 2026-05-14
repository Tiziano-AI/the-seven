import {
  isReviewerMemberPosition,
  type PhaseTwoEvaluation,
  type REVIEWER_MEMBER_POSITIONS,
} from "@the-seven/contracts";
import {
  type ClaimedJobLease,
  ClaimedJobLeaseLostError,
  type listSessionArtifacts,
  verifyActiveClaimedJobLease,
} from "@the-seven/db";
import { parsePhaseTwoEvaluationArtifact } from "./prompts";

/** Phase task contract for one cancellable orchestration branch. */
export type PhaseTask = (signal: AbortSignal) => Promise<void>;

/** Stored phase-one response shape consumed by review and synthesis prompts. */
export type ResponseArtifact = Readonly<{
  memberPosition: (typeof REVIEWER_MEMBER_POSITIONS)[number];
  modelId: string;
  content: string;
}>;

/** Stored phase-two review shape before parsing into evaluator JSON. */
export type ReviewArtifact = ResponseArtifact;

/** Parsed evaluator result paired with the reviewer identity that produced it. */
export type EvaluationArtifact = Readonly<{
  memberPosition: (typeof REVIEWER_MEMBER_POSITIONS)[number];
  evaluation: PhaseTwoEvaluation;
}>;

/** Builds the immutable lease identity every workflow side effect must present. */
export function buildClaimedLease(input: {
  jobId: number;
  leaseOwner: string;
  sessionId: number;
}): ClaimedJobLease {
  return {
    sessionId: input.sessionId,
    jobId: input.jobId,
    leaseOwner: input.leaseOwner,
  };
}

function throwIfLeaseAborted(input: { signal?: AbortSignal; claimedLease: ClaimedJobLease }) {
  if (!input.signal?.aborted) {
    return;
  }
  if (input.signal.reason instanceof ClaimedJobLeaseLostError) {
    throw input.signal.reason;
  }
  throw new ClaimedJobLeaseLostError({
    ...input.claimedLease,
    reason: "orchestration signal aborted",
  });
}

/**
 * Verifies active lease ownership immediately before a workflow side effect.
 * Throws without mutating when the worker no longer owns the claimed job.
 */
export async function verifyClaimedLease(input: {
  signal?: AbortSignal;
  claimedLease: ClaimedJobLease;
}) {
  throwIfLeaseAborted(input);
  await verifyActiveClaimedJobLease({ ...input.claimedLease, now: new Date() });
  throwIfLeaseAborted(input);
}

/** Converts stored artifacts to typed phase-one response rows. */
export function toResponseArtifacts(
  artifacts: Awaited<ReturnType<typeof listSessionArtifacts>>,
): ResponseArtifact[] {
  return artifacts
    .filter((artifact) => artifact.artifactKind === "response")
    .map((artifact) => {
      if (!isReviewerMemberPosition(artifact.memberPosition)) {
        throw new Error(`Invalid response member position ${artifact.memberPosition}`);
      }
      return {
        memberPosition: artifact.memberPosition,
        modelId: artifact.modelId,
        content: artifact.content,
      };
    });
}

/** Converts stored artifacts to typed phase-two review rows. */
export function toReviewArtifacts(
  artifacts: Awaited<ReturnType<typeof listSessionArtifacts>>,
): ReviewArtifact[] {
  return artifacts
    .filter((artifact) => artifact.artifactKind === "review")
    .map((artifact) => {
      if (!isReviewerMemberPosition(artifact.memberPosition)) {
        throw new Error(`Invalid review member position ${artifact.memberPosition}`);
      }
      return {
        memberPosition: artifact.memberPosition,
        modelId: artifact.modelId,
        content: artifact.content,
      };
    });
}

/** Parses canonical phase-two review artifacts for the synthesis prompt. */
export function toEvaluationArtifacts(input: {
  reviews: ReadonlyArray<ReviewArtifact>;
}): EvaluationArtifact[] {
  return input.reviews.map((review) => {
    const parsed = parsePhaseTwoEvaluationArtifact({
      content: review.content,
    });
    if (!parsed.ok) {
      throw parsed.error;
    }
    return {
      memberPosition: review.memberPosition,
      evaluation: parsed.evaluation,
    };
  });
}

/**
 * Runs sibling provider tasks with cancellation fan-out.
 * Rejects with the first task failure after settling sibling abort handlers.
 */
export async function runParallel(tasks: ReadonlyArray<PhaseTask>, parentSignal?: AbortSignal) {
  if (tasks.length === 0) {
    return;
  }

  const controller = new AbortController();
  const abortFromParent = () => {
    controller.abort(parentSignal?.reason);
  };
  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }
  const promises = tasks.map((task) => task(controller.signal));

  try {
    await Promise.all(promises);
  } catch (error) {
    controller.abort(error);
    await Promise.allSettled(promises);
    throw error;
  } finally {
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}
