import type { Request } from "express";
import { getOrCreateByokUserContext } from "../../workflows/byokUser";
import { getDemoSessionContext } from "../../services/demoAuth";

export type AuthContext =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "invalid"; reason: "invalid_token" | "expired_token" }>
  | Readonly<{
      kind: "byok";
      userId: number;
      byokId: string;
      openRouterKey: string;
    }>
  | Readonly<{
      kind: "demo";
      userId: number;
      email: string;
      openRouterKey: string;
    }>;

type ParsedAuthorization =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "byok"; token: string }>
  | Readonly<{ kind: "demo"; token: string }>;

function parseAuthorizationHeader(value: string | undefined): ParsedAuthorization {
  if (!value) return { kind: "none" };
  const trimmed = value.trim();
  if (!trimmed) return { kind: "none" };

  const bearerMatch = trimmed.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch?.[1]) {
    return { kind: "byok", token: bearerMatch[1].trim() };
  }

  const demoMatch = trimmed.match(/^Demo\s+(.+)$/i);
  if (demoMatch?.[1]) {
    return { kind: "demo", token: demoMatch[1].trim() };
  }

  return { kind: "none" };
}

export async function resolveAuthContext(params: {
  req: Request;
  now: Date;
  demoOpenRouterKey: string | null;
}): Promise<AuthContext> {
  const parsed = parseAuthorizationHeader(params.req.headers.authorization);
  if (parsed.kind === "none") {
    return { kind: "none" };
  }

  if (parsed.kind === "byok") {
    if (!parsed.token) {
      return { kind: "invalid", reason: "invalid_token" };
    }
    const context = await getOrCreateByokUserContext(parsed.token);
    return {
      kind: "byok",
      userId: context.user.id,
      byokId: context.byokId,
      openRouterKey: parsed.token,
    };
  }

  if (!params.demoOpenRouterKey) {
    return { kind: "invalid", reason: "invalid_token" };
  }

  const demo = await getDemoSessionContext({ token: parsed.token, now: params.now });
  if (demo.kind === "missing") {
    return { kind: "invalid", reason: "invalid_token" };
  }
  if (demo.kind === "expired") {
    return { kind: "invalid", reason: "expired_token" };
  }

  return {
    kind: "demo",
    userId: demo.userId,
    email: demo.email,
    openRouterKey: params.demoOpenRouterKey,
  };
}
