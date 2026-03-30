import "server-only";

import type { ErrorKind } from "@the-seven/contracts";
import { OpenRouterRequestFailedError } from "../adapters/openrouter";
import { ResendRequestFailedError } from "../adapters/resend";

export class EdgeError extends Error {
  readonly kind: ErrorKind;
  readonly details: object;
  readonly status: number;

  constructor(input: { kind: ErrorKind; message: string; details: object; status: number }) {
    super(input.message);
    this.kind = input.kind;
    this.details = input.details;
    this.status = input.status;
  }
}

function buildUpstreamError(input: {
  service: "openrouter" | "resend";
  status: number | null;
  message: string;
}) {
  return new EdgeError({
    kind: "upstream_error",
    message: input.message,
    details: {
      service: input.service,
      status: input.status,
    },
    status: input.status ?? 502,
  });
}

export function mapProviderErrorToEdgeError(error: unknown) {
  if (error instanceof OpenRouterRequestFailedError) {
    return buildUpstreamError({
      service: "openrouter",
      status: error.status,
      message: error.message,
    });
  }

  if (error instanceof ResendRequestFailedError) {
    return buildUpstreamError({
      service: "resend",
      status: error.status,
      message: error.message,
    });
  }

  return null;
}
