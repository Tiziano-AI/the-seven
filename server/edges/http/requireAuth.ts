import { EdgeError } from "./errors";
import type { AuthContext } from "./auth";

export type AuthenticatedContext = Extract<AuthContext, { kind: "byok" | "demo" }>;
export type ByokContext = Extract<AuthContext, { kind: "byok" }>;
export type DemoContext = Extract<AuthContext, { kind: "demo" }>;

export function requireAuth(auth: AuthContext): AuthenticatedContext {
  if (auth.kind === "byok" || auth.kind === "demo") return auth;
  const reason = auth.kind === "invalid" ? auth.reason : "missing_auth";
  throw new EdgeError({
    kind: "unauthorized",
    message: "Missing or invalid authentication",
    details: { reason },
    status: 401,
  });
}

export function requireByokAuth(auth: AuthContext): ByokContext {
  if (auth.kind === "byok") return auth;
  if (auth.kind === "demo") {
    throw new EdgeError({
      kind: "forbidden",
      message: "BYOK authentication required",
      details: { reason: "byok_only" },
      status: 403,
    });
  }
  const reason = auth.kind === "invalid" ? auth.reason : "missing_auth";
  throw new EdgeError({
    kind: "unauthorized",
    message: "Missing or invalid authentication",
    details: { reason },
    status: 401,
  });
}

export function requireDemoAuth(auth: AuthContext): DemoContext {
  if (auth.kind === "demo") return auth;
  if (auth.kind === "byok") {
    throw new EdgeError({
      kind: "forbidden",
      message: "Demo authentication required",
      details: { reason: "demo_only" },
      status: 403,
    });
  }
  const reason = auth.kind === "invalid" ? auth.reason : "missing_auth";
  throw new EdgeError({
    kind: "unauthorized",
    message: "Missing or invalid authentication",
    details: { reason },
    status: 401,
  });
}
