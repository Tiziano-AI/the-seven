import "server-only";

import { type IngressSource, invalidInputDetails, parseIngressSource } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { EdgeError } from "./errors";

export type IngressContext = Readonly<{
  source: IngressSource;
  version: string | null;
}>;

export function parseIngressHeaders(request: NextRequest): IngressContext {
  const rawSource = request.headers.get("x-seven-ingress");
  const source = rawSource === null ? "web" : parseIngressSource(rawSource);
  if (!source) {
    throw new EdgeError({
      kind: "invalid_input",
      message: "Invalid ingress source",
      details: invalidInputDetails({
        reason: "invalid_ingress",
        issues: [
          { path: "headers.x-seven-ingress", message: "Ingress source must be web, cli, or api" },
        ],
      }),
      status: 400,
    });
  }

  const versionRaw = request.headers.get("x-seven-ingress-version");
  const version = versionRaw?.trim();
  if (version && (/[\r\n]/.test(version) || version.length > 120)) {
    throw new EdgeError({
      kind: "invalid_input",
      message: "Invalid ingress version",
      details: invalidInputDetails({
        reason: "invalid_ingress",
        issues: [
          {
            path: "headers.x-seven-ingress-version",
            message: "Ingress version must be single-line and at most 120 characters",
          },
        ],
      }),
      status: 400,
    });
  }

  return {
    source,
    version: version || null,
  };
}
