import "server-only";

import { serverRuntime } from "@the-seven/config";
import type { AuthPolicy } from "@the-seven/contracts";
import { getOrCreateUser } from "@the-seven/db";
import type { NextRequest } from "next/server";
import { validateOpenRouterApiKey } from "../adapters/openrouter";
import { deriveByokPrincipalFromApiKey } from "../domain/byok";
import { getDemoSessionContext } from "../services/demoAuth";

export const DEMO_SESSION_COOKIE = "seven_demo_session";

export type AuthContext =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "invalid"; reason: "invalid_token" | "expired_token" }>
  | Readonly<{ kind: "byok"; userId: number; principal: string; openRouterKey: string }>
  | Readonly<{
      kind: "demo";
      demoSessionId: number;
      userId: number;
      principal: string;
      openRouterKey: string;
      expiresAt: number;
    }>;

type ParsedAuthorization =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "byok"; token: string }>
  | Readonly<{ kind: "invalid" }>;

function parseAuthorizationHeader(value: string | null): ParsedAuthorization {
  const trimmed = value?.trim();
  if (!trimmed) {
    return { kind: "none" };
  }

  const bearer = trimmed.match(/^Bearer\s+(.+)$/i);
  if (bearer?.[1]) {
    return { kind: "byok", token: bearer[1].trim() };
  }

  return { kind: "invalid" };
}

export async function resolveAuthContext(
  request: NextRequest,
  now: Date,
  policy: AuthPolicy = "any",
): Promise<AuthContext> {
  const parsed =
    policy === "demo-cookie"
      ? ({ kind: "none" } as const)
      : parseAuthorizationHeader(request.headers.get("authorization"));
  if (parsed.kind === "invalid") {
    return { kind: "invalid", reason: "invalid_token" };
  }

  const demoCookie = request.cookies.get(DEMO_SESSION_COOKIE)?.value.trim();
  if (parsed.kind === "none" && !demoCookie) {
    return { kind: "none" };
  }

  if (parsed.kind === "byok") {
    if (!parsed.token) {
      return { kind: "invalid", reason: "invalid_token" };
    }
    const valid = await validateOpenRouterApiKey(parsed.token);
    if (!valid) {
      return { kind: "invalid", reason: "invalid_token" };
    }

    const principal = deriveByokPrincipalFromApiKey(parsed.token);
    const user = await getOrCreateUser({
      kind: "byok",
      principal,
    });

    return {
      kind: "byok",
      userId: user.id,
      principal,
      openRouterKey: parsed.token,
    };
  }

  const env = serverRuntime();
  if (!env.demo.enabled || !env.demo.openRouterApiKey) {
    return { kind: "invalid", reason: "invalid_token" };
  }

  const session = await getDemoSessionContext({ token: demoCookie ?? "", now });
  if (session.kind === "missing") {
    return { kind: "invalid", reason: "invalid_token" };
  }
  if (session.kind === "expired") {
    return { kind: "invalid", reason: "expired_token" };
  }

  return {
    kind: "demo",
    demoSessionId: session.sessionId,
    userId: session.userId,
    principal: session.principal,
    openRouterKey: env.demo.openRouterApiKey,
    expiresAt: session.expiresAt,
  };
}
