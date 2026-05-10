import "server-only";

import { forbiddenDetails, unauthorizedDetails } from "@the-seven/contracts";
import type { AuthContext } from "./auth";
import { EdgeError } from "./errors";

export type AuthenticatedContext = Extract<AuthContext, { kind: "byok" | "demo" }>;
export type ByokAuthenticatedContext = Extract<AuthContext, { kind: "byok" }>;

export function requireAuth(auth: AuthContext): AuthenticatedContext {
  if (auth.kind === "byok" || auth.kind === "demo") {
    return auth;
  }
  throw new EdgeError({
    kind: "unauthorized",
    message: "Missing or invalid authentication",
    details: unauthorizedDetails(auth.kind === "invalid" ? auth.reason : "missing_auth"),
    status: 401,
  });
}

export function requireByokAuth(auth: AuthContext): ByokAuthenticatedContext {
  if (auth.kind === "byok") {
    return auth;
  }
  if (auth.kind === "demo") {
    throw new EdgeError({
      kind: "forbidden",
      message: "This endpoint requires BYOK authentication",
      details: forbiddenDetails("demo_not_allowed"),
      status: 403,
    });
  }
  throw new EdgeError({
    kind: "unauthorized",
    message: "Missing or invalid authentication",
    details: unauthorizedDetails(auth.kind === "invalid" ? auth.reason : "missing_auth"),
    status: 401,
  });
}
