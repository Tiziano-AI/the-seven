import type { OpenRouterMessage, OpenRouterRequest } from "../adapters/openrouter/client";
import type { CouncilMemberTuning } from "../../shared/domain/councilMemberTuning";
import { getModelDetails, type OpenRouterModelDetails } from "./openrouterCatalog";

export type OpenRouterChatPreflightError =
  | Readonly<{
      kind: "model_not_found";
      modelId: string;
      message: string;
    }>
  | Readonly<{
      kind: "unsupported_parameter";
      modelId: string;
      parameter: string;
      message: string;
    }>;

export type OpenRouterChatPreflightOk = Readonly<{
  ok: true;
  request: OpenRouterRequest;
}>;

export type OpenRouterChatPreflightResult =
  | OpenRouterChatPreflightOk
  | Readonly<{ ok: false; error: OpenRouterChatPreflightError }>;

function supportsParameter(details: OpenRouterModelDetails, parameter: string): boolean {
  // OpenRouter catalog can omit `supported_parameters`. Treat the empty list as "unknown"
  // and avoid over-rejecting models when OpenRouter does not expose this metadata.
  if (details.supportedParameters.length === 0) return true;
  return details.supportedParameters.includes(parameter);
}

export async function preflightOpenRouterChatCompletion(params: {
  modelId: string;
  messages: ReadonlyArray<OpenRouterMessage>;
  tuning: CouncilMemberTuning | null;
}): Promise<OpenRouterChatPreflightResult> {
  const details = await getModelDetails(params.modelId);
  if (!details) {
    return {
      ok: false,
      error: {
        kind: "model_not_found",
        modelId: params.modelId,
        message: `Model ID not found in OpenRouter catalog cache: ${params.modelId}`,
      },
    };
  }

  const request: OpenRouterRequest = {
    model: params.modelId,
    messages: [...params.messages],
  };

  const tuning = params.tuning;
  if (tuning) {
    if (tuning.temperature !== null) {
      if (!supportsParameter(details, "temperature")) {
        return {
          ok: false,
          error: {
            kind: "unsupported_parameter",
            modelId: params.modelId,
            parameter: "temperature",
            message: `Model does not advertise support for "temperature" in OpenRouter catalog: ${params.modelId}`,
          },
        };
      }
      request.temperature = tuning.temperature;
    }

    if (tuning.seed !== null) {
      if (!supportsParameter(details, "seed")) {
        return {
          ok: false,
          error: {
            kind: "unsupported_parameter",
            modelId: params.modelId,
            parameter: "seed",
            message: `Model does not advertise support for "seed" in OpenRouter catalog: ${params.modelId}`,
          },
        };
      }
      request.seed = tuning.seed;
    }

    if (tuning.reasoningEffort !== null) {
      if (!supportsParameter(details, "reasoning")) {
        return {
          ok: false,
          error: {
            kind: "unsupported_parameter",
            modelId: params.modelId,
            parameter: "reasoning",
            message: `Model does not advertise support for "reasoning" in OpenRouter catalog: ${params.modelId}`,
          },
        };
      }
      request.reasoning = { effort: tuning.reasoningEffort };
    }

    if (tuning.includeReasoning !== null) {
      if (!supportsParameter(details, "include_reasoning")) {
        return {
          ok: false,
          error: {
            kind: "unsupported_parameter",
            modelId: params.modelId,
            parameter: "include_reasoning",
            message: `Model does not advertise support for "include_reasoning" in OpenRouter catalog: ${params.modelId}`,
          },
        };
      }
      request.include_reasoning = tuning.includeReasoning;
    }

    if (tuning.verbosity !== null) {
      if (!supportsParameter(details, "verbosity")) {
        return {
          ok: false,
          error: {
            kind: "unsupported_parameter",
            modelId: params.modelId,
            parameter: "verbosity",
            message: `Model does not advertise support for "verbosity" in OpenRouter catalog: ${params.modelId}`,
          },
        };
      }
      request.verbosity = tuning.verbosity;
    }
  }

  return {
    ok: true,
    request,
  };
}

export function formatOpenRouterChatPreflightErrorForUser(error: OpenRouterChatPreflightError): string {
  return error.message;
}
