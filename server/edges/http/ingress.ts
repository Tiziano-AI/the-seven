import type { Request } from "express";
import { parseIngressSource, type IngressSource } from "../../../shared/domain/ingress";
import { isSingleLine } from "../../../shared/domain/strings";

const MAX_INGRESS_VERSION_LENGTH = 120;

export type IngressContext = Readonly<{
  source: IngressSource;
  version: string | null;
}>;

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function parseIngressVersion(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isSingleLine(trimmed)) return null;
  if (trimmed.length > MAX_INGRESS_VERSION_LENGTH) return null;
  return trimmed;
}

export function parseIngressHeaders(req: Request): IngressContext {
  const sourceHeader = firstHeaderValue(req.headers["x-seven-ingress"]);
  const parsedSource = parseIngressSource(sourceHeader);
  const source = parsedSource ?? "web";

  const versionHeader = firstHeaderValue(req.headers["x-seven-ingress-version"]);
  const version = parseIngressVersion(versionHeader);

  return { source, version };
}
