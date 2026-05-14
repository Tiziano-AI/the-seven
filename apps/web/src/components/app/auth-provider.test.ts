import { describe, expect, test } from "vitest";
import { ApiErrorResponse } from "@/lib/apiClient";
import { shouldClearLocalDemoSessionAfterLogoutError } from "./demo-logout";

function unauthorized(reason: "missing_auth" | "invalid_token" | "expired_token") {
  return new ApiErrorResponse({
    kind: "unauthorized",
    message: "Unauthorized",
    traceId: "trace-test",
    details: { reason },
    status: 401,
  });
}

describe("shouldClearLocalDemoSessionAfterLogoutError", () => {
  test("clears local demo state after server-side absent-session denials", () => {
    expect(shouldClearLocalDemoSessionAfterLogoutError(unauthorized("missing_auth"))).toBe(true);
    expect(shouldClearLocalDemoSessionAfterLogoutError(unauthorized("invalid_token"))).toBe(true);
    expect(shouldClearLocalDemoSessionAfterLogoutError(unauthorized("expired_token"))).toBe(true);
  });

  test("keeps local demo state for non-authority logout failures", () => {
    expect(
      shouldClearLocalDemoSessionAfterLogoutError(
        new ApiErrorResponse({
          kind: "forbidden",
          message: "Same-origin request required",
          traceId: "trace-test",
          details: { reason: "same_origin_required" },
          status: 403,
        }),
      ),
    ).toBe(false);
    expect(shouldClearLocalDemoSessionAfterLogoutError(new Error("network failed"))).toBe(false);
  });
});
