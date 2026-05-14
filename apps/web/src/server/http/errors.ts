import "server-only";

import { HttpContractError, upstreamErrorDetails } from "@the-seven/contracts";
import { OpenRouterRequestFailedError } from "../adapters/openrouter";
import { ResendRequestFailedError } from "../adapters/resend";

export { HttpContractError as EdgeError };

function buildUpstreamError(input: { service: "openrouter" | "resend" }) {
  return new HttpContractError({
    kind: "upstream_error",
    message: `${input.service === "openrouter" ? "OpenRouter" : "Resend"} request failed`,
    details: upstreamErrorDetails({
      service: input.service,
    }),
    status: 502,
  });
}

export function mapProviderErrorToEdgeError(error: unknown) {
  if (error instanceof OpenRouterRequestFailedError) {
    return buildUpstreamError({
      service: "openrouter",
    });
  }

  if (error instanceof ResendRequestFailedError) {
    return buildUpstreamError({
      service: "resend",
    });
  }

  return null;
}
