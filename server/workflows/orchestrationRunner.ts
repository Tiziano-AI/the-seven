import { errorToLogFields, log } from "../_core/log";
import { getSessionById, markSessionFailed } from "../stores/sessionStore";
import { orchestrateSession } from "./orchestration";

export type OrchestrationRequest = Readonly<{
  traceId: string;
  sessionId: number;
  userId: number;
  apiKey: string;
}>;

/**
 * Runs orchestration with a guarded error boundary to prevent unhandled rejections.
 */
export async function runOrchestration(params: OrchestrationRequest): Promise<void> {
  try {
    await orchestrateSession(params);
  } catch (error: unknown) {
    log("error", "orchestration_unhandled_error", {
      trace_id: params.traceId,
      session_id: params.sessionId,
      user_id: params.userId,
      ...errorToLogFields(error),
    });

    try {
      const session = await getSessionById(params.sessionId);
      if (!session) {
        log("warn", "orchestration_unhandled_missing_session", {
          trace_id: params.traceId,
          session_id: params.sessionId,
          user_id: params.userId,
        });
        return;
      }
      if (session.status === "completed" || session.status === "failed") {
        log("warn", "orchestration_unhandled_already_terminal", {
          trace_id: params.traceId,
          session_id: params.sessionId,
          user_id: params.userId,
          status: session.status,
          failure_kind: session.failureKind,
        });
        return;
      }

      await markSessionFailed(params.sessionId, "internal_error");
    } catch (statusError: unknown) {
      log("warn", "orchestration_unhandled_status_update_failed", {
        trace_id: params.traceId,
        session_id: params.sessionId,
        user_id: params.userId,
        ...errorToLogFields(statusError),
      });
    }
  }
}

/**
 * Fire-and-forget orchestration runner for HTTP edges.
 */
export function startOrchestration(params: OrchestrationRequest): void {
  void runOrchestration(params);
}
