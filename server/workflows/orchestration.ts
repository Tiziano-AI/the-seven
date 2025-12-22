import { errorToLogFields, log } from "../_core/log";
import { normalizeCouncilMemberTuningInput } from "../domain/councilMemberTuning";
import {
  buildSystemPromptForPhase,
  getRunSpecMember,
  parseSessionRunSpecJson,
  type SessionRunSpec,
} from "../domain/sessionRunSpec";
import { createMemberResponse, getMemberResponsesBySessionId } from "../stores/memberResponseStore";
import { createMemberReview, getMemberReviewsBySessionId } from "../stores/memberReviewStore";
import { createMemberSynthesis, getMemberSynthesisBySessionId } from "../stores/memberSynthesisStore";
import {
  getSessionById,
  markSessionCompleted,
  markSessionFailed,
  tryStartSessionProcessing,
  type SessionFailureKind,
} from "../stores/sessionStore";
import {
  REVIEWER_MEMBER_POSITIONS,
  SYNTHESIZER_MEMBER_POSITION,
} from "../../shared/domain/sevenMembers";
import type { MemberResponse, MemberReview } from "../../drizzle/schema";
import { buildReviewPrompt, buildSynthesisPrompt } from "./orchestrationPrompts";
import { OpenRouterRateLimitError, runOpenRouterCallWithPreflight } from "./orchestrationOpenRouter";

async function runParallel(tasks: ReadonlyArray<() => Promise<void>>): Promise<void> {
  if (tasks.length === 0) return;
  const results = await Promise.allSettled(tasks.map((task) => task()));
  const rejected = results.find((result) => result.status === "rejected");
  if (rejected && rejected.status === "rejected") {
    throw rejected.reason;
  }
}

function isExpectedPhase1Complete(responses: ReadonlyArray<MemberResponse>): boolean {
  const have = new Set(responses.map((row) => row.memberPosition));
  return REVIEWER_MEMBER_POSITIONS.every((memberPosition) => have.has(memberPosition));
}

function isExpectedPhase2Complete(reviews: ReadonlyArray<MemberReview>): boolean {
  const have = new Set(reviews.map((row) => row.reviewerMemberPosition));
  return REVIEWER_MEMBER_POSITIONS.every((memberPosition) => have.has(memberPosition));
}

function failureKindForInference(
  error: unknown,
  fallback: SessionFailureKind
): SessionFailureKind {
  if (error instanceof OpenRouterRateLimitError) {
    return "openrouter_rate_limited";
  }
  return fallback;
}

async function failSession(params: {
  traceId: string;
  sessionId: number;
  userId: number;
  failureKind: SessionFailureKind;
  event: string;
  error: unknown;
}): Promise<void> {
  log("error", params.event, {
    trace_id: params.traceId,
    session_id: params.sessionId,
    user_id: params.userId,
    ...errorToLogFields(params.error),
  });
  try {
    await markSessionFailed(params.sessionId, params.failureKind);
  } catch (statusError: unknown) {
    log("warn", "orchestration_failed_status_update_failed", {
      trace_id: params.traceId,
      session_id: params.sessionId,
      user_id: params.userId,
      ...errorToLogFields(statusError),
    });
  }
}

export async function orchestrateSession(params: {
  traceId: string;
  sessionId: number;
  userId: number;
  apiKey: string;
}): Promise<void> {
  const { traceId, sessionId, userId, apiKey } = params;

  const session = await getSessionById(sessionId);
  if (!session || session.userId !== userId) {
    await failSession({
      traceId,
      sessionId,
      userId,
      failureKind: "internal_error",
      event: "orchestration_session_missing_or_mismatched",
      error: new Error("Session not found or user mismatch"),
    });
    return;
  }

  if (session.status === "completed") {
    return;
  }

  const started = await tryStartSessionProcessing(sessionId);
  if (!started) {
    log("info", "orchestration_skipped", {
      trace_id: traceId,
      session_id: sessionId,
      user_id: userId,
    });
    return;
  }

  let runSpec: SessionRunSpec;
  try {
    runSpec = parseSessionRunSpecJson(session.runSpec);
  } catch (error: unknown) {
    await failSession({
      traceId,
      sessionId,
      userId,
      failureKind: "invalid_run_spec",
      event: "orchestration_run_spec_invalid",
      error,
    });
    return;
  }

  try {
    const synthesis = await getMemberSynthesisBySessionId(sessionId);
    if (synthesis) {
      await markSessionCompleted(sessionId);
      return;
    }

    log("info", "orchestration_started", {
      trace_id: traceId,
      session_id: sessionId,
      user_id: userId,
    });

    // Phase 1: 6 independent responses (parallel; idempotent by persisted artifacts).
    const phase1Existing = await getMemberResponsesBySessionId(sessionId);
    const haveResponses = new Set(phase1Existing.map((row) => row.memberPosition));

    const phase1Tasks = REVIEWER_MEMBER_POSITIONS.filter(
      (memberPosition) => !haveResponses.has(memberPosition)
    ).map((memberPosition) => async () => {
      const member = getRunSpecMember(runSpec, memberPosition);
      const systemPrompt = buildSystemPromptForPhase(runSpec, memberPosition, 1);

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: runSpec.userMessage },
      ] as const;

      const attempt = await runOpenRouterCallWithPreflight({
        traceId,
        sessionId,
        phase: 1,
        memberPosition,
        apiKey,
        modelId: member.model.modelId,
        messages: [...messages],
        tuning: normalizeCouncilMemberTuningInput(member.tuning),
      });
      if (!attempt.ok) {
        throw attempt.error;
      }

      const content = attempt.content;
      await createMemberResponse({
        sessionId,
        memberPosition,
        modelId: member.model.modelId,
        response: content,
      });
    });

    try {
      await runParallel(phase1Tasks);
    } catch (error: unknown) {
      await failSession({
        traceId,
        sessionId,
        userId,
        failureKind: failureKindForInference(error, "phase1_inference_failed"),
        event: "orchestration_phase1_failed",
        error,
      });
      return;
    }

    const responses = await getMemberResponsesBySessionId(sessionId);
    if (!isExpectedPhase1Complete(responses)) {
      await failSession({
        traceId,
        sessionId,
        userId,
        failureKind: "phase1_inference_failed",
        event: "orchestration_phase1_incomplete",
        error: new Error("Phase 1 incomplete after inference"),
      });
      return;
    }

    // Phase 2: 6 peer reviews (parallel; idempotent by persisted artifacts).
    const phase2Existing = await getMemberReviewsBySessionId(sessionId);
    const haveReviews = new Set(phase2Existing.map((row) => row.reviewerMemberPosition));

    const phase2Tasks = REVIEWER_MEMBER_POSITIONS.filter(
      (memberPosition) => !haveReviews.has(memberPosition)
    ).map((reviewerMemberPosition) => async () => {
      const member = getRunSpecMember(runSpec, reviewerMemberPosition);
      const systemPrompt = buildSystemPromptForPhase(runSpec, reviewerMemberPosition, 2);
      const reviewPrompt = buildReviewPrompt({
        userMessage: runSpec.userMessage,
        responses,
        reviewerMemberPosition,
      });

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: reviewPrompt },
      ] as const;

      const attempt = await runOpenRouterCallWithPreflight({
        traceId,
        sessionId,
        phase: 2,
        memberPosition: reviewerMemberPosition,
        apiKey,
        modelId: member.model.modelId,
        messages: [...messages],
        tuning: normalizeCouncilMemberTuningInput(member.tuning),
      });
      if (!attempt.ok) {
        throw attempt.error;
      }

      const content = attempt.content;
      await createMemberReview({
        sessionId,
        reviewerMemberPosition,
        modelId: member.model.modelId,
        reviewContent: content,
      });
    });

    try {
      await runParallel(phase2Tasks);
    } catch (error: unknown) {
      await failSession({
        traceId,
        sessionId,
        userId,
        failureKind: failureKindForInference(error, "phase2_inference_failed"),
        event: "orchestration_phase2_failed",
        error,
      });
      return;
    }

    const reviews = await getMemberReviewsBySessionId(sessionId);
    if (!isExpectedPhase2Complete(reviews)) {
      await failSession({
        traceId,
        sessionId,
        userId,
        failureKind: "phase2_inference_failed",
        event: "orchestration_phase2_incomplete",
        error: new Error("Phase 2 incomplete after inference"),
      });
      return;
    }

    // Phase 3: single synthesis (skip if already present).
    const existingSynthesis = await getMemberSynthesisBySessionId(sessionId);
    if (!existingSynthesis) {
      const member = getRunSpecMember(runSpec, SYNTHESIZER_MEMBER_POSITION);
      const systemPrompt = buildSystemPromptForPhase(runSpec, SYNTHESIZER_MEMBER_POSITION, 3);
      const synthesisPrompt = buildSynthesisPrompt({
        userMessage: runSpec.userMessage,
        responses,
        reviews,
      });

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: synthesisPrompt },
      ] as const;

      const attempt = await runOpenRouterCallWithPreflight({
        traceId,
        sessionId,
        phase: 3,
        memberPosition: SYNTHESIZER_MEMBER_POSITION,
        apiKey,
        modelId: member.model.modelId,
        messages: [...messages],
        tuning: normalizeCouncilMemberTuningInput(member.tuning),
      });
      if (!attempt.ok) {
        await failSession({
          traceId,
          sessionId,
          userId,
          failureKind: failureKindForInference(attempt.error, "phase3_inference_failed"),
          event: "orchestration_phase3_failed",
          error: attempt.error,
        });
        return;
      }

      const content = attempt.content;
      await createMemberSynthesis({
        sessionId,
        memberPosition: SYNTHESIZER_MEMBER_POSITION,
        modelId: member.model.modelId,
        synthesis: content,
      });
    }

    await markSessionCompleted(sessionId);
    log("info", "orchestration_completed", {
      trace_id: traceId,
      session_id: sessionId,
      user_id: userId,
    });
  } catch (error: unknown) {
    await failSession({
      traceId,
      sessionId,
      userId,
      failureKind: "internal_error",
      event: "orchestration_failed",
      error,
    });
  }
}
