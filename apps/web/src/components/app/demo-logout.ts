import { ApiErrorResponse } from "@/lib/apiClient";

/** Returns true only when server authority proves the demo session is already absent. */
export function shouldClearLocalDemoSessionAfterLogoutError(error: unknown): boolean {
  return (
    error instanceof ApiErrorResponse &&
    error.kind === "unauthorized" &&
    "reason" in error.details &&
    (error.details.reason === "missing_auth" ||
      error.details.reason === "invalid_token" ||
      error.details.reason === "expired_token")
  );
}
