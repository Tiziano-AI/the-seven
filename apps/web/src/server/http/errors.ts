import "server-only";

import { HttpContractError, upstreamErrorDetails } from "@the-seven/contracts";
import { OpenRouterRequestFailedError } from "../adapters/openrouter";
import { ResendRequestFailedError } from "../adapters/resend";
import { redactText } from "../domain/redaction";

export { HttpContractError as EdgeError };

function buildUpstreamError(input: {
  service: "openrouter" | "resend";
  status: number | null;
  message: string;
}) {
  return new HttpContractError({
    kind: "upstream_error",
    message: redactText(input.message),
    details: upstreamErrorDetails({
      service: input.service,
      status: input.status,
    }),
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
