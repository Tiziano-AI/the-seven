import "server-only";

import {
  REVIEWER_MEMBER_POSITIONS,
  type SessionSnapshot,
  SYNTHESIZER_MEMBER_POSITION,
  sessionSnapshotSchema,
} from "@the-seven/contracts";
import {
  ClaimedJobLeaseLostError,
  createSessionArtifact,
  getSessionArtifact,
  getSessionById,
  listSessionArtifacts,
  markClaimedSessionCompleted,
  markClaimedSessionFailed,
  markJobCompleted,
  markJobFailed,
  type SessionFailureKind,
  startClaimedSessionProcessing,
} from "@the-seven/db";
import { decryptJobCredential } from "../domain/jobCredential";
import { redactErrorMessage } from "../domain/redaction";
import { buildSystemPromptForPhase, getSnapshotMember } from "../domain/sessionSnapshot";
import { scheduleSessionCostBackfill } from "./openrouterBilling";
import { OpenRouterPhaseRateLimitError, runOpenRouterPhaseCall } from "./openrouterRun";
import {
  buildClaimedLease,
  type EvaluationArtifact,
  runParallel,
  toEvaluationArtifacts,
  toResponseArtifacts,
  toReviewArtifacts,
  verifyClaimedLease,
} from "./orchestrateSessionState";
import {
  buildReviewPrompt,
  buildSynthesisPrompt,
  formatPhaseTwoEvaluationContent,
  parsePhaseTwoEvaluationResponse,
} from "./prompts";

function toFailureKind(error: unknown, fallback: SessionFailureKind): SessionFailureKind {
  return error instanceof OpenRouterPhaseRateLimitError ? "openrouter_rate_limited" : fallback;
}

async function failSession(input: {
  jobId: number;
  leaseOwner: string;
  sessionId: number;
  failureKind: SessionFailureKind;
  error: unknown;
  apiKey?: string;
}) {
  if (input.error instanceof ClaimedJobLeaseLostError) {
    throw input.error;
  }
  await markClaimedSessionFailed({
    sessionId: input.sessionId,
    jobId: input.jobId,
    leaseOwner: input.leaseOwner,
    failureKind: input.failureKind,
    lastError: redactErrorMessage(input.error, "Unknown orchestration failure"),
  });
  if (input.apiKey) {
    scheduleSessionCostBackfill({ sessionId: input.sessionId, apiKey: input.apiKey });
  }
}

/**
 * Orchestrates one claimed session job from pending/resume state to terminal
 * session state while binding provider and artifact side effects to the lease.
 */
export async function orchestrateClaimedJob(input: {
  jobId: number;
  leaseOwner: string;
  sessionId: number;
  credentialCiphertext: string | null;
  signal?: AbortSignal;
}) {
  const claimedLease = buildClaimedLease(input);
  const session = await getSessionById(input.sessionId);
  if (!session) {
    await markJobFailed({
      jobId: input.jobId,
      leaseOwner: input.leaseOwner,
      lastError: "Manuscript backing row not found",
    });
    return;
  }

  if (session.status === "completed") {
    await markClaimedSessionCompleted({
      sessionId: session.id,
      jobId: input.jobId,
      leaseOwner: input.leaseOwner,
    });
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

  await verifyClaimedLease({ signal: input.signal, claimedLease });
  const started = await startClaimedSessionProcessing(claimedLease);
  if (!started) {
    await verifyClaimedLease({ signal: input.signal, claimedLease });
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
      await markClaimedSessionCompleted({
        sessionId: session.id,
        jobId: input.jobId,
        leaseOwner: input.leaseOwner,
      });
      scheduleSessionCostBackfill({ sessionId: session.id, apiKey });
      return;
    }

    const existingArtifacts = await listSessionArtifacts(session.id);
    const existingResponses = toResponseArtifacts(existingArtifacts);
    const existingResponsePositions = new Set(
      existingResponses.map((artifact) => artifact.memberPosition),
    );
    const phaseOneTasks = REVIEWER_MEMBER_POSITIONS.filter(
      (position) => !existingResponsePositions.has(position),
    ).map((memberPosition) => async (signal: AbortSignal) => {
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
        signal,
        claimedLease,
      });

      if (!result.ok) {
        throw result.error;
      }

      await verifyClaimedLease({ signal, claimedLease });
      await createSessionArtifact({
        sessionId: session.id,
        phase: 1,
        artifactKind: "response",
        memberPosition,
        modelId: member.model.modelId,
        content: result.content,
        claimedLease,
      });
    });

    try {
      await runParallel(phaseOneTasks, input.signal);
    } catch (error) {
      await failSession({
        jobId: input.jobId,
        leaseOwner: input.leaseOwner,
        sessionId: session.id,
        failureKind: toFailureKind(error, "phase1_inference_failed"),
        error,
        apiKey,
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
        apiKey,
      });
      return;
    }

    const phaseTwoExisting = toReviewArtifacts(await listSessionArtifacts(session.id));
    const phaseTwoExistingPositions = new Set(
      phaseTwoExisting.map((artifact) => artifact.memberPosition),
    );
    const phaseTwoTasks = REVIEWER_MEMBER_POSITIONS.filter(
      (position) => !phaseTwoExistingPositions.has(position),
    ).map((memberPosition) => async (signal: AbortSignal) => {
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
            }),
          },
        ],
        tuning: member.tuning,
        signal,
        claimedLease,
      });

      if (!result.ok) {
        throw result.error;
      }

      const parsedEvaluation = parsePhaseTwoEvaluationResponse({
        content: result.content,
      });
      if (!parsedEvaluation.ok) {
        throw parsedEvaluation.error;
      }

      await verifyClaimedLease({ signal, claimedLease });
      await createSessionArtifact({
        sessionId: session.id,
        phase: 2,
        artifactKind: "review",
        memberPosition,
        modelId: member.model.modelId,
        content: formatPhaseTwoEvaluationContent(parsedEvaluation.evaluation),
        claimedLease,
      });
    });

    try {
      await runParallel(phaseTwoTasks, input.signal);
    } catch (error) {
      await failSession({
        jobId: input.jobId,
        leaseOwner: input.leaseOwner,
        sessionId: session.id,
        failureKind: toFailureKind(error, "phase2_inference_failed"),
        error,
        apiKey,
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
        apiKey,
      });
      return;
    }

    let phaseTwoEvaluations: EvaluationArtifact[];
    try {
      phaseTwoEvaluations = toEvaluationArtifacts({
        reviews: phaseTwoArtifacts,
      });
    } catch (error) {
      await failSession({
        jobId: input.jobId,
        leaseOwner: input.leaseOwner,
        sessionId: session.id,
        failureKind: "phase2_inference_failed",
        error,
        apiKey,
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
              evaluations: phaseTwoEvaluations,
            }),
          },
        ],
        tuning: synthesizer.tuning,
        signal: input.signal,
        claimedLease,
      });

      if (!result.ok) {
        await failSession({
          jobId: input.jobId,
          leaseOwner: input.leaseOwner,
          sessionId: session.id,
          failureKind: toFailureKind(result.error, "phase3_inference_failed"),
          error: result.error,
          apiKey,
        });
        return;
      }

      await verifyClaimedLease({ signal: input.signal, claimedLease });
      await createSessionArtifact({
        sessionId: session.id,
        phase: 3,
        artifactKind: "synthesis",
        memberPosition: SYNTHESIZER_MEMBER_POSITION,
        modelId: synthesizer.model.modelId,
        content: result.content,
        claimedLease,
      });
    }

    await markClaimedSessionCompleted({
      sessionId: session.id,
      jobId: input.jobId,
      leaseOwner: input.leaseOwner,
    });
    scheduleSessionCostBackfill({ sessionId: session.id, apiKey });
  } catch (error) {
    if (error instanceof ClaimedJobLeaseLostError) {
      throw error;
    }
    await failSession({
      jobId: input.jobId,
      leaseOwner: input.leaseOwner,
      sessionId: session.id,
      failureKind: "internal_error",
      error,
      apiKey,
    });
  }
}
