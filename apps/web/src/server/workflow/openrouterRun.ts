import "server-only";

import { PROVIDER_OUTPUT_TOKEN_LIMITS } from "@the-seven/config";
import type { CouncilMemberTuning, MemberPosition } from "@the-seven/contracts";
import { phaseTwoEvaluationResponseFormat } from "@the-seven/contracts";
import {
  type ClaimedJobLease,
  ClaimedJobLeaseLostError,
  verifyActiveClaimedJobLease,
} from "@the-seven/db";
import {
  callOpenRouter,
  materializeCouncilMemberTuningInput,
  type OpenRouterMessage,
  type OpenRouterRequest,
  OpenRouterRequestFailedError,
  type OpenRouterResponse,
  type OpenRouterResponseFormat,
} from "../adapters/openrouter";
import { getModelCapability } from "../services/models";
import { recordOpenRouterProviderCall } from "./openrouterRunDiagnostics";

export class OpenRouterPhaseRateLimitError extends Error {
  readonly status: number | null;

  constructor(input: { message: string; status: number | null }) {
    super(input.message);
    this.name = "OpenRouterPhaseRateLimitError";
    this.status = input.status;
  }
}

export class OpenRouterUnsupportedParameterError extends Error {
  readonly deniedParameters: ReadonlyArray<string>;

  constructor(input: { modelId: string; deniedParameters: ReadonlyArray<string> }) {
    super(
      `Unsupported OpenRouter parameter(s) for ${input.modelId}: ${input.deniedParameters.join(", ")}`,
    );
    this.name = "OpenRouterUnsupportedParameterError";
    this.deniedParameters = input.deniedParameters;
  }
}

type PhaseResponseFormat = Readonly<{
  options: Readonly<{
    response_format?: OpenRouterResponseFormat;
    provider?: NonNullable<OpenRouterRequest["provider"]>;
  }>;
  sentParameters: string[];
  deniedParameters: string[];
}>;

type OutputTokenCap = Readonly<{
  maxTokens: number | null;
  options: Readonly<{ max_tokens?: number }>;
  sentParameters: string[];
  deniedParameters: string[];
}>;

const OPENROUTER_CHAT_PROVIDER_IGNORES = ["amazon-bedrock", "azure"] as const;

function buildOpenRouterRequest(input: {
  modelId: string;
  messages: ReadonlyArray<OpenRouterMessage>;
  tuningOptions: Omit<OpenRouterRequest, "model" | "messages">;
}): OpenRouterRequest {
  return {
    model: input.modelId,
    messages: input.messages,
    ...input.tuningOptions,
  };
}

function materializeOpenRouterProviderOptions(input: {
  sentParameters: ReadonlyArray<string>;
  phaseProvider?: NonNullable<OpenRouterRequest["provider"]>;
}): Readonly<{ provider?: NonNullable<OpenRouterRequest["provider"]> }> {
  if (input.sentParameters.length === 0 && !input.phaseProvider) {
    return {};
  }

  return {
    provider: {
      ...input.phaseProvider,
      ...(input.sentParameters.length > 0 ? { require_parameters: true as const } : {}),
      ignore: OPENROUTER_CHAT_PROVIDER_IGNORES,
    },
  };
}

function extractAssistantContent(input: {
  phase: 1 | 2 | 3;
  memberPosition: MemberPosition;
  modelId: string;
  response: OpenRouterResponse;
}) {
  const firstChoice = input.response.choices[0];
  if (!firstChoice) {
    throw new Error(
      `OpenRouter returned 0 choices for phase ${input.phase}, member ${input.memberPosition}, model ${input.modelId}`,
    );
  }

  if (firstChoice.error?.code === 429) {
    throw new OpenRouterPhaseRateLimitError({
      message: "OpenRouter rate limit exceeded",
      status: firstChoice.error.code,
    });
  }

  if (firstChoice.error) {
    throw new Error(
      `OpenRouter choice error ${firstChoice.error.code}: ${firstChoice.error.message}`,
    );
  }

  const content = firstChoice.message.content;
  if (content === null || content.trim().length === 0) {
    throw new Error(
      `OpenRouter returned empty content for phase ${input.phase}, member ${input.memberPosition}, model ${input.modelId}`,
    );
  }

  return content;
}

function materializePhaseResponseFormat(input: {
  phase: 1 | 2 | 3;
  supportedParameters: ReadonlyArray<string>;
}): PhaseResponseFormat {
  if (input.phase !== 2) {
    return { options: {}, sentParameters: [], deniedParameters: [] };
  }

  const supported = new Set(input.supportedParameters);
  const deniedParameters = ["response_format", "structured_outputs"].filter(
    (parameter) => !supported.has(parameter),
  );
  if (deniedParameters.length > 0) {
    return {
      options: {},
      sentParameters: [],
      deniedParameters,
    };
  }

  return {
    options: {
      response_format: phaseTwoEvaluationResponseFormat,
      provider: { ignore: OPENROUTER_CHAT_PROVIDER_IGNORES },
    },
    sentParameters: ["response_format"],
    deniedParameters: [],
  };
}

function phaseOutputLimit(phase: 1 | 2 | 3): number {
  if (phase === 1) return PROVIDER_OUTPUT_TOKEN_LIMITS.phase1;
  if (phase === 2) return PROVIDER_OUTPUT_TOKEN_LIMITS.phase2;
  return PROVIDER_OUTPUT_TOKEN_LIMITS.phase3;
}

function materializeOutputTokenCap(input: {
  phase: 1 | 2 | 3;
  supportedParameters: ReadonlyArray<string>;
  maxCompletionTokens: number | null;
  expirationDate: string | null;
}): OutputTokenCap {
  if (input.expirationDate !== null) {
    return {
      maxTokens: null,
      options: {},
      sentParameters: [],
      deniedParameters: ["model_expiration"],
    };
  }

  const supported = new Set(input.supportedParameters);
  if (!supported.has("max_tokens")) {
    return {
      maxTokens: null,
      options: {},
      sentParameters: [],
      deniedParameters: ["max_tokens"],
    };
  }

  if (input.maxCompletionTokens !== null && input.maxCompletionTokens < 1) {
    return {
      maxTokens: null,
      options: {},
      sentParameters: [],
      deniedParameters: ["max_tokens"],
    };
  }

  const requested = phaseOutputLimit(input.phase);
  if (input.maxCompletionTokens !== null && input.maxCompletionTokens < requested) {
    return {
      maxTokens: null,
      options: {},
      sentParameters: [],
      deniedParameters: ["max_tokens"],
    };
  }

  const maxTokens = requested;
  return {
    maxTokens,
    options: { max_tokens: maxTokens },
    sentParameters: ["max_tokens"],
    deniedParameters: [],
  };
}

function throwLeaseAbort(input: { signal?: AbortSignal }) {
  if (input.signal?.aborted && input.signal.reason instanceof ClaimedJobLeaseLostError) {
    throw input.signal.reason;
  }
}

async function verifyProviderEgressLease(input: {
  signal?: AbortSignal;
  claimedLease?: ClaimedJobLease;
}) {
  throwLeaseAbort(input);
  if (input.claimedLease) {
    await verifyActiveClaimedJobLease({ ...input.claimedLease, now: new Date() });
  }
  throwLeaseAbort(input);
}

export async function runOpenRouterPhaseCall(input: {
  sessionId: number;
  phase: 1 | 2 | 3;
  memberPosition: MemberPosition;
  apiKey: string;
  modelId: string;
  messages: ReadonlyArray<OpenRouterMessage>;
  tuning: CouncilMemberTuning | null;
  signal?: AbortSignal;
  claimedLease?: ClaimedJobLease;
}) {
  await verifyProviderEgressLease(input);
  const capability = await getModelCapability(input.modelId);
  const supportedParameters = capability?.supportedParameters ?? [];
  const materialized = materializeCouncilMemberTuningInput(input.tuning, supportedParameters);
  const outputTokenCap = capability
    ? materializeOutputTokenCap({
        phase: input.phase,
        supportedParameters,
        maxCompletionTokens: capability.maxCompletionTokens,
        expirationDate: capability.expirationDate,
      })
    : { maxTokens: null, options: {}, sentParameters: [], deniedParameters: [] };
  const phaseResponseFormat = materializePhaseResponseFormat({
    phase: input.phase,
    supportedParameters,
  });
  const deniedParameters = [
    ...materialized.deniedParameters,
    ...outputTokenCap.deniedParameters,
    ...phaseResponseFormat.deniedParameters,
  ];
  const sentParameters = [
    ...materialized.sentParameters,
    ...outputTokenCap.sentParameters,
    ...phaseResponseFormat.sentParameters,
  ];
  const sentReasoningEffort = sentParameters.includes("reasoning")
    ? (input.tuning?.reasoningEffort ?? null)
    : null;
  const request = buildOpenRouterRequest({
    modelId: input.modelId,
    messages: input.messages,
    tuningOptions: {
      ...materialized.options,
      ...outputTokenCap.options,
      ...phaseResponseFormat.options,
      ...materializeOpenRouterProviderOptions({
        sentParameters,
        phaseProvider: phaseResponseFormat.options.provider,
      }),
    },
  });
  const sentProviderRequireParameters = request.provider?.require_parameters === true;
  const sentProviderIgnoredProviders = request.provider?.ignore ?? [];
  const requestStartedAt = new Date();
  let response: OpenRouterResponse | null = null;

  if (!capability || deniedParameters.length > 0) {
    throwLeaseAbort(input);
    const responseCompletedAt = new Date();
    const error = new OpenRouterUnsupportedParameterError({
      modelId: input.modelId,
      deniedParameters: capability ? deniedParameters : ["model"],
    });
    await recordOpenRouterProviderCall({
      sessionId: input.sessionId,
      phase: input.phase,
      memberPosition: input.memberPosition,
      modelId: input.modelId,
      messages: input.messages,
      catalogRefreshedAt: capability?.refreshedAt ?? null,
      supportedParameters,
      sentParameters: [],
      sentReasoningEffort: null,
      sentProviderRequireParameters: false,
      sentProviderIgnoredProviders: [],
      deniedParameters: capability ? deniedParameters : ["model"],
      requestStartedAt,
      requestMaxOutputTokens: null,
      responseCompletedAt,
      response: null,
      billingLookupStatus: "not_requested",
      error,
      errorStatus: null,
      errorCode: null,
      claimedLease: input.claimedLease,
    });
    return { ok: false as const, error };
  }

  try {
    await verifyProviderEgressLease(input);
    response = await callOpenRouter(input.apiKey, request, { signal: input.signal });
    throwLeaseAbort(input);
    const content = extractAssistantContent({
      phase: input.phase,
      memberPosition: input.memberPosition,
      modelId: input.modelId,
      response,
    });
    const responseCompletedAt = new Date();

    await recordOpenRouterProviderCall({
      sessionId: input.sessionId,
      phase: input.phase,
      memberPosition: input.memberPosition,
      modelId: input.modelId,
      messages: input.messages,
      catalogRefreshedAt: capability.refreshedAt,
      supportedParameters,
      sentParameters,
      sentReasoningEffort,
      sentProviderRequireParameters,
      sentProviderIgnoredProviders,
      deniedParameters,
      requestStartedAt,
      requestMaxOutputTokens: outputTokenCap.maxTokens,
      responseCompletedAt,
      response,
      billingLookupStatus: response.id ? "pending" : "not_requested",
      error: null,
      errorStatus: null,
      errorCode: null,
      claimedLease: input.claimedLease,
    });

    return { ok: true as const, content };
  } catch (error) {
    if (error instanceof ClaimedJobLeaseLostError) {
      throw error;
    }
    throwLeaseAbort(input);
    const responseCompletedAt = new Date();
    if (error instanceof OpenRouterRequestFailedError && error.response) {
      response = error.response;
    }
    const phaseRateLimitError =
      error instanceof OpenRouterRequestFailedError && error.status === 429
        ? new OpenRouterPhaseRateLimitError({
            message: "OpenRouter rate limit exceeded",
            status: error.status,
          })
        : null;
    const normalizedError = error instanceof Error ? error : new Error("OpenRouter request failed");

    await recordOpenRouterProviderCall({
      sessionId: input.sessionId,
      phase: input.phase,
      memberPosition: input.memberPosition,
      modelId: input.modelId,
      messages: input.messages,
      catalogRefreshedAt: capability.refreshedAt,
      supportedParameters,
      sentParameters,
      sentReasoningEffort,
      sentProviderRequireParameters,
      sentProviderIgnoredProviders,
      deniedParameters,
      requestStartedAt,
      requestMaxOutputTokens: outputTokenCap.maxTokens,
      responseCompletedAt,
      response,
      billingLookupStatus: response?.id ? "pending" : "not_requested",
      error: normalizedError,
      errorStatus:
        normalizedError instanceof OpenRouterRequestFailedError
          ? normalizedError.status
          : normalizedError instanceof OpenRouterPhaseRateLimitError
            ? normalizedError.status
            : null,
      errorCode:
        normalizedError instanceof OpenRouterRequestFailedError ? normalizedError.code : null,
      claimedLease: input.claimedLease,
    });

    if (phaseRateLimitError) {
      return { ok: false as const, error: phaseRateLimitError };
    }

    return {
      ok: false as const,
      error: normalizedError,
    };
  }
}
