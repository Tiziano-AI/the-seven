import "server-only";

import { loadServerEnv } from "@the-seven/config";
import { getOrCreateUser } from "@the-seven/db";
import type { NextRequest } from "next/server";
import { deriveByokPrincipalFromApiKey } from "../domain/byok";
import { getDemoSessionContext } from "../services/demoAuth";

export type AuthContext =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "invalid"; reason: "invalid_token" | "expired_token" }>
  | Readonly<{ kind: "byok"; userId: number; principal: string; openRouterKey: string }>
  | Readonly<{ kind: "demo"; userId: number; principal: string; openRouterKey: string }>;

type ParsedAuthorization =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "byok"; token: string }>
  | Readonly<{ kind: "demo"; token: string }>;

function parseAuthorizationHeader(value: string | null): ParsedAuthorization {
  const trimmed = value?.trim();
  if (!trimmed) {
    return { kind: "none" };
  }

  const bearer = trimmed.match(/^Bearer\s+(.+)$/i);
  if (bearer?.[1]) {
    return { kind: "byok", token: bearer[1].trim() };
  }

  const demo = trimmed.match(/^Demo\s+(.+)$/i);
  if (demo?.[1]) {
    return { kind: "demo", token: demo[1].trim() };
  }

  return { kind: "none" };
}

export async function resolveAuthContext(request: NextRequest, now: Date): Promise<AuthContext> {
  const parsed = parseAuthorizationHeader(request.headers.get("authorization"));
  if (parsed.kind === "none") {
    return { kind: "none" };
  }

  if (parsed.kind === "byok") {
    if (!parsed.token) {
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

  const env = loadServerEnv();
  if (!env.demo.enabled || !env.demo.openRouterApiKey) {
    return { kind: "invalid", reason: "invalid_token" };
  }

  const session = await getDemoSessionContext({ token: parsed.token, now });
  if (session.kind === "missing") {
    return { kind: "invalid", reason: "invalid_token" };
  }
  if (session.kind === "expired") {
    return { kind: "invalid", reason: "expired_token" };
  }

  return {
    kind: "demo",
    userId: session.userId,
    principal: session.principal,
    openRouterKey: env.demo.openRouterApiKey,
  };
}
