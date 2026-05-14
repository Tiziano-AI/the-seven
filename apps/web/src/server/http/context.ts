import "server-only";

import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { AuthContext } from "./auth";
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

const IPV4_PATTERN =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

function isValidIp(value: string): boolean {
  if (IPV4_PATTERN.test(value)) {
    return true;
  }
  try {
    const parsed = new URL(`http://[${value}]`);
    return parsed.hostname.length > 0 && parsed.hostname !== "[]";
  } catch {
    return false;
  }
}

function getRequestIp(request: DirectIpRequest): string | null {
  const directIp = request.ip?.trim();
  if (!directIp) {
    return null;
  }
  return isValidIp(directIp) ? directIp : null;
}

export function createRequestMetadataContext(request: NextRequest): RequestMetadataContext {
  return {
    traceId: randomUUID(),
    now: new Date(),
    ip: getRequestIp(request),
    ingress: parseIngressHeaders(request),
  };
}
