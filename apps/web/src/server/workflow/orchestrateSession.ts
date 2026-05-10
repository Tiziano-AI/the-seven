import "server-only";

import {
  isReviewerMemberPosition,
  REVIEWER_MEMBER_POSITIONS,
  type SessionSnapshot,
  SYNTHESIZER_MEMBER_POSITION,
  sessionSnapshotSchema,
} from "@the-seven/contracts";
import {
  createSessionArtifact,
  getSessionArtifact,
  getSessionById,
  listSessionArtifacts,
  markJobCompleted,
  markJobFailed,
  markSessionCompleted,
  markSessionFailed,
  refreshSessionUsageTotals,
  type SessionFailureKind,
  startSessionProcessing,
} from "@the-seven/db";
import { decryptJobCredential } from "../domain/jobCredential";
import { redactErrorMessage } from "../domain/redaction";
import { buildSystemPromptForPhase, getSnapshotMember } from "../domain/sessionSnapshot";
import {
  backfillSessionCosts,
  OpenRouterPhaseRateLimitError,
  runOpenRouterPhaseCall,
} from "./openrouterRun";
import { buildReviewPrompt, buildSynthesisPrompt } from "./prompts";

type ResponseArtifact = Readonly<{
  memberPosition: (typeof REVIEWER_MEMBER_POSITIONS)[number];
  modelId: string;
  content: string;
}>;

type ReviewArtifact = ResponseArtifact;

function toFailureKind(error: unknown, fallback: SessionFailureKind): SessionFailureKind {
  return error instanceof OpenRouterPhaseRateLimitError ? "openrouter_rate_limited" : fallback;
}

async function failSession(input: {
  jobId: number;
  leaseOwner: string;
  sessionId: number;
  failureKind: SessionFailureKind;
  error: unknown;
}) {
  await refreshSessionUsageTotals(input.sessionId);
  await markSessionFailed(input.sessionId, input.failureKind);
  await markJobFailed({
    jobId: input.jobId,
    leaseOwner: input.leaseOwner,
    lastError: redactErrorMessage(input.error, "Unknown orchestration failure"),
  });
}

function toResponseArtifacts(
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

function toReviewArtifacts(
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

async function runParallel(tasks: ReadonlyArray<() => Promise<void>>) {
  if (tasks.length === 0) {
    return;
  }

  const results = await Promise.allSettled(tasks.map((task) => task()));
  const rejected = results.find((result) => result.status === "rejected");
  if (rejected && rejected.status === "rejected") {
    throw rejected.reason;
  }
}

export async function orchestrateClaimedJob(input: {
  jobId: number;
  leaseOwner: string;
  sessionId: number;
  credentialCiphertext: string | null;
}) {
  const session = await getSessionById(input.sessionId);
  if (!session) {
    await markJobFailed({
      jobId: input.jobId,
      leaseOwner: input.leaseOwner,
      lastError: "Session not found",
    });
    return;
  }

  if (session.status === "completed") {
    await refreshSessionUsageTotals(session.id);
    await markJobCompleted({ jobId: input.jobId, leaseOwner: input.leaseOwner });
    return;
  }

  if (!input.credentialCiphertext) {
    await failSession({
      jobId: input.jobId,
      leaseOwner: input.leaseOwner,
      sessionId: session.id,
      failureKind: "server_restart",
      error: new Error("Missing encrypted job credential"),
    });
    return;
  }

  const started = await startSessionProcessing(session.id);
  if (!started) {
    await markJobCompleted({ jobId: input.jobId, leaseOwner: input.leaseOwner });
    return;
  }

  let apiKey: string;
  try {
    apiKey = decryptJobCredential(input.credentialCiphertext, {
      sessionId: input.sessionId,
      jobId: input.jobId,
    });
  } catch (error) {
    await failSession({
      jobId: input.jobId,
      leaseOwner: input.leaseOwner,
      sessionId: session.id,
      failureKind: "server_restart",
      error,
    });
    return;
  }

  let snapshot: SessionSnapshot;
  try {
    snapshot = sessionSnapshotSchema.parse(session.snapshotJson);
  } catch (error) {
    await failSession({
      jobId: input.jobId,
      leaseOwner: input.leaseOwner,
      sessionId: session.id,
      failureKind: "invalid_run_spec",
      error,
    });
    return;
  }

  try {
    const synthesis = await getSessionArtifact({
      sessionId: session.id,
      artifactKind: "synthesis",
      memberPosition: SYNTHESIZER_MEMBER_POSITION,
    });
    if (synthesis) {
      await refreshSessionUsageTotals(session.id);
      await markSessionCompleted(session.id);
      await markJobCompleted({ jobId: input.jobId, leaseOwner: input.leaseOwner });
      void backfillSessionCosts({ sessionId: session.id, apiKey });
      return;
    }

    const existingArtifacts = await listSessionArtifacts(session.id);
    const existingResponses = toResponseArtifacts(existingArtifacts);
    const existingResponsePositions = new Set(
      existingResponses.map((artifact) => artifact.memberPosition),
    );
    const phaseOneTasks = REVIEWER_MEMBER_POSITIONS.filter(
      (position) => !existingResponsePositions.has(position),
    ).map((memberPosition) => async () => {
      const member = getSnapshotMember(snapshot, memberPosition);
      const result = await runOpenRouterPhaseCall({
        sessionId: session.id,
        phase: 1,
        memberPosition,
        apiKey,
        modelId: member.model.modelId,
        messages: [
          { role: "system", content: buildSystemPromptForPhase(snapshot, memberPosition, 1) },
          { role: "user", content: snapshot.userMessage },
        ],
        tuning: member.tuning,
      });

      if (!result.ok) {
        throw result.error;
      }

      await createSessionArtifact({
        sessionId: session.id,
        phase: 1,
        artifactKind: "response",
        memberPosition,
        modelId: member.model.modelId,
        content: result.content,
      });
    });

    try {
      await runParallel(phaseOneTasks);
    } catch (error) {
      await failSession({
        jobId: input.jobId,
        leaseOwner: input.leaseOwner,
        sessionId: session.id,
        failureKind: toFailureKind(error, "phase1_inference_failed"),
        error,
      });
      return;
    }

    const phaseOneArtifacts = toResponseArtifacts(await listSessionArtifacts(session.id));
    const completePhaseOne = REVIEWER_MEMBER_POSITIONS.every((position) =>
      phaseOneArtifacts.some((artifact) => artifact.memberPosition === position),
    );
    if (!completePhaseOne) {
      await failSession({
        jobId: input.jobId,
        leaseOwner: input.leaseOwner,
        sessionId: session.id,
        failureKind: "phase1_inference_failed",
        error: new Error("Phase 1 incomplete after execution"),
      });
      return;
    }

    const phaseTwoExisting = toReviewArtifacts(await listSessionArtifacts(session.id));
    const phaseTwoExistingPositions = new Set(
      phaseTwoExisting.map((artifact) => artifact.memberPosition),
    );
    const phaseTwoTasks = REVIEWER_MEMBER_POSITIONS.filter(
      (position) => !phaseTwoExistingPositions.has(position),
    ).map((memberPosition) => async () => {
      const member = getSnapshotMember(snapshot, memberPosition);
      const result = await runOpenRouterPhaseCall({
        sessionId: session.id,
        phase: 2,
        memberPosition,
        apiKey,
        modelId: member.model.modelId,
        messages: [
          { role: "system", content: buildSystemPromptForPhase(snapshot, memberPosition, 2) },
          {
            role: "user",
            content: buildReviewPrompt({
              userMessage: snapshot.userMessage,
              responses: phaseOneArtifacts,
              reviewerMemberPosition: memberPosition,
            }),
          },
        ],
        tuning: member.tuning,
      });

      if (!result.ok) {
        throw result.error;
      }

      await createSessionArtifact({
        sessionId: session.id,
        phase: 2,
        artifactKind: "review",
        memberPosition,
        modelId: member.model.modelId,
        content: result.content,
      });
    });

    try {
      await runParallel(phaseTwoTasks);
    } catch (error) {
      await failSession({
        jobId: input.jobId,
        leaseOwner: input.leaseOwner,
        sessionId: session.id,
        failureKind: toFailureKind(error, "phase2_inference_failed"),
        error,
      });
      return;
    }

    const phaseTwoArtifacts = toReviewArtifacts(await listSessionArtifacts(session.id));
    const completePhaseTwo = REVIEWER_MEMBER_POSITIONS.every((position) =>
      phaseTwoArtifacts.some((artifact) => artifact.memberPosition === position),
    );
    if (!completePhaseTwo) {
      await failSession({
        jobId: input.jobId,
        leaseOwner: input.leaseOwner,
        sessionId: session.id,
        failureKind: "phase2_inference_failed",
        error: new Error("Phase 2 incomplete after execution"),
      });
      return;
    }

    const existingSynthesis = await getSessionArtifact({
      sessionId: session.id,
      artifactKind: "synthesis",
      memberPosition: SYNTHESIZER_MEMBER_POSITION,
    });

    if (!existingSynthesis) {
      const synthesizer = getSnapshotMember(snapshot, SYNTHESIZER_MEMBER_POSITION);
      const result = await runOpenRouterPhaseCall({
        sessionId: session.id,
        phase: 3,
        memberPosition: SYNTHESIZER_MEMBER_POSITION,
        apiKey,
        modelId: synthesizer.model.modelId,
        messages: [
          {
            role: "system",
            content: buildSystemPromptForPhase(snapshot, SYNTHESIZER_MEMBER_POSITION, 3),
          },
          {
            role: "user",
            content: buildSynthesisPrompt({
              userMessage: snapshot.userMessage,
              responses: phaseOneArtifacts,
              reviews: phaseTwoArtifacts,
            }),
          },
        ],
        tuning: synthesizer.tuning,
      });

      if (!result.ok) {
        await failSession({
          jobId: input.jobId,
          leaseOwner: input.leaseOwner,
          sessionId: session.id,
          failureKind: toFailureKind(result.error, "phase3_inference_failed"),
          error: result.error,
        });
        return;
      }

      await createSessionArtifact({
        sessionId: session.id,
        phase: 3,
        artifactKind: "synthesis",
        memberPosition: SYNTHESIZER_MEMBER_POSITION,
        modelId: synthesizer.model.modelId,
        content: result.content,
      });
    }

    await refreshSessionUsageTotals(session.id);
    await markSessionCompleted(session.id);
    await markJobCompleted({ jobId: input.jobId, leaseOwner: input.leaseOwner });
    void backfillSessionCosts({ sessionId: session.id, apiKey });
  } catch (error) {
    await failSession({
      jobId: input.jobId,
      leaseOwner: input.leaseOwner,
      sessionId: session.id,
      failureKind: "internal_error",
      error,
    });
  }
}
