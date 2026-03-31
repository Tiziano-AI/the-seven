import "server-only";

import { parseIngressSource } from "@the-seven/contracts";
import type { NextRequest } from "next/server";

export type IngressContext = Readonly<{
  source: "web" | "cli" | "api";
  version: string | null;
}>;

export function parseIngressHeaders(request: NextRequest): IngressContext {
  const source = parseIngressSource(request.headers.get("x-seven-ingress")) ?? "web";
  const versionRaw = request.headers.get("x-seven-ingress-version");
  const version = versionRaw?.trim();
  return {
    source,
    version: version ? version.slice(0, 120) : null,
  };
}
