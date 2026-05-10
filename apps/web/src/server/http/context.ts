import "server-only";

import { randomUUID } from "node:crypto";
import { serverRuntime } from "@the-seven/config";
import type { NextRequest } from "next/server";
import { type AuthContext, resolveAuthContext } from "./auth";
import { type IngressContext, parseIngressHeaders } from "./ingress";

export type RequestMetadataContext = Readonly<{
  traceId: string;
  now: Date;
  ip: string | null;
  ingress: IngressContext;
}>;

export type RequestContext = RequestMetadataContext &
  Readonly<{
    auth: AuthContext;
  }>;

type DirectIpRequest = NextRequest & Readonly<{ ip?: string }>;

function getRequestIp(request: DirectIpRequest): string | null {
  const directIp = request.ip?.trim();
  if (directIp) {
    return directIp;
  }

  if (!serverRuntime().trustedProxyHeaders) {
    return null;
  }

  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) {
    return cf;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) {
    return null;
  }
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

export function createRequestMetadataContext(request: NextRequest): RequestMetadataContext {
  return {
    traceId: randomUUID(),
    now: new Date(),
    ip: getRequestIp(request),
    ingress: parseIngressHeaders(request),
  };
}

export async function createRequestContext(request: NextRequest): Promise<RequestContext> {
  const metadata = createRequestMetadataContext(request);
  return {
    ...metadata,
    auth: await resolveAuthContext(request, metadata.now),
  };
}
