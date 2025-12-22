import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import { requireServerRuntimeConfig } from "../../_core/runtimeConfig";
import { resolveAuthContext, type AuthContext } from "./auth";

export type RequestContext = Readonly<{
  traceId: string;
  now: Date;
  ip: string | null;
  auth: AuthContext;
}>;

function parseTraceId(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function firstForwardedIp(value: string | string[] | undefined): string | null {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw.split(",")[0]?.trim();
  return trimmed ? trimmed : null;
}

export function getRequestIp(req: Request): string | null {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();
  const forwarded = firstForwardedIp(req.headers["x-forwarded-for"]);
  if (forwarded) return forwarded;
  const remote = req.socket.remoteAddress;
  return remote ?? null;
}

export async function createRequestContext(req: Request, res: Response): Promise<RequestContext> {
  const traceHeader = req.headers["x-trace-id"];
  const incomingTrace = parseTraceId(
    typeof traceHeader === "string"
      ? traceHeader
      : Array.isArray(traceHeader)
        ? traceHeader[0]
        : undefined
  );
  const traceId = incomingTrace ?? randomUUID();
  res.setHeader("X-Trace-Id", traceId);

  const now = new Date();
  const runtime = requireServerRuntimeConfig();

  const auth = await resolveAuthContext({
    req,
    now,
    demoOpenRouterKey: runtime.demo.openRouterApiKey,
  });

  return {
    traceId,
    now,
    ip: getRequestIp(req),
    auth,
  };
}
