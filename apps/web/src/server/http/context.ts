import "server-only";

import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { type AuthContext, resolveAuthContext } from "./auth";
import { type IngressContext, parseIngressHeaders } from "./ingress";

export type RequestContext = Readonly<{
  traceId: string;
  now: Date;
  ip: string | null;
  auth: AuthContext;
  ingress: IngressContext;
}>;

function getRequestIp(request: NextRequest): string | null {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf?.trim()) {
    return cf.trim();
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) {
    return null;
  }

  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

export async function createRequestContext(request: NextRequest): Promise<RequestContext> {
  const traceId = request.headers.get("x-trace-id")?.trim() || randomUUID();
  const now = new Date();

  return {
    traceId,
    now,
    ip: getRequestIp(request),
    auth: await resolveAuthContext(request, now),
    ingress: parseIngressHeaders(request),
  };
}
