import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { randomUUID } from "crypto";

export type TrpcContext = {
  apiKey: string | null;
  traceId: string;
};

function parseBearerToken(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.trim();
  return token ? token : null;
}

function parseTraceId(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const traceHeader = opts.req.headers["x-trace-id"];
  const incoming = parseTraceId(
    typeof traceHeader === "string"
      ? traceHeader
      : Array.isArray(traceHeader)
        ? traceHeader[0]
        : undefined
  );
  const traceId = incoming ?? randomUUID();

  opts.res.setHeader("X-Trace-Id", traceId);

  const apiKey = parseBearerToken(opts.req.headers.authorization);
  return {
    apiKey,
    traceId,
  };
}
