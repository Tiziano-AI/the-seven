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
import {
  extractAssistantContent,
  OpenRouterPhaseRateLimitError,
  OpenRouterUnsupportedParameterError,
} from "./openrouterRunResponse";

export { OpenRouterPhaseRateLimitError, OpenRouterUnsupportedParameterError };

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

const CREDIT_LIMIT_AFFORDABLE_MAX_TOKENS_PATTERN = /can only afford\s+([1-9]\d*)\b/i;
const MIN_CREDIT_LIMIT_RETRY_MAX_TOKENS = 1024;
const CREDIT_LIMIT_RETRY_HEADROOM_TOKENS = 512;
const CREDIT_LIMIT_RETRY_HEADROOM_RATIO = 0.05;

function creditLimitedRetryMaxTokens(input: {
  error: OpenRouterRequestFailedError;
  requestedMaxTokens: number | null;
}): number | null {
  if (input.error.status !== 402 || input.requestedMaxTokens === null) {
    return null;
  }

  const match = CREDIT_LIMIT_AFFORDABLE_MAX_TOKENS_PATTERN.exec(input.error.message);
  if (!match) {
    return null;
  }

  const affordableMaxTokens = Number.parseInt(match[1], 10);
  if (
    !Number.isSafeInteger(affordableMaxTokens) ||
    affordableMaxTokens < MIN_CREDIT_LIMIT_RETRY_MAX_TOKENS ||
    affordableMaxTokens >= input.requestedMaxTokens
  ) {
    return null;
  }

  const retryHeadroom = Math.max(
    CREDIT_LIMIT_RETRY_HEADROOM_TOKENS,
    Math.ceil(affordableMaxTokens * CREDIT_LIMIT_RETRY_HEADROOM_RATIO),
  );
  const retryMaxTokens = affordableMaxTokens - retryHeadroom;
  if (retryMaxTokens < MIN_CREDIT_LIMIT_RETRY_MAX_TOKENS) {
    return null;
  }

  return retryMaxTokens;
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
  claimedLease: ClaimedJobLease;
}) {
  throwLeaseAbort(input);
  await verifyActiveClaimedJobLease({ ...input.claimedLease, now: new Date() });
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
  claimedLease: ClaimedJobLease;
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

  const activeCapability = capability;

  async function recordProviderAttempt(attempt: {
    requestStartedAt: Date;
    requestMaxOutputTokens: number | null;
    responseCompletedAt: Date;
    response: OpenRouterResponse | null;
    billingLookupStatus: "not_requested" | "pending";
    error: Error | null;
    errorStatus: number | null;
    errorCode: string | null;
  }) {
    await recordOpenRouterProviderCall({
      sessionId: input.sessionId,
      phase: input.phase,
      memberPosition: input.memberPosition,
      modelId: input.modelId,
      messages: input.messages,
      catalogRefreshedAt: activeCapability.refreshedAt,
      supportedParameters,
      sentParameters,
      sentReasoningEffort,
      sentProviderRequireParameters,
      sentProviderIgnoredProviders,
      deniedParameters,
      requestStartedAt: attempt.requestStartedAt,
      requestMaxOutputTokens: attempt.requestMaxOutputTokens,
      responseCompletedAt: attempt.responseCompletedAt,
      response: attempt.response,
      billingLookupStatus: attempt.billingLookupStatus,
      error: attempt.error,
      errorStatus: attempt.errorStatus,
      errorCode: attempt.errorCode,
      claimedLease: input.claimedLease,
    });
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

    await recordProviderAttempt({
      requestStartedAt,
      requestMaxOutputTokens: outputTokenCap.maxTokens,
      responseCompletedAt,
      response,
      billingLookupStatus: response.id ? "pending" : "not_requested",
      error: null,
      errorStatus: null,
      errorCode: null,
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

    await recordProviderAttempt({
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
    });

    const retryMaxTokens =
      normalizedError instanceof OpenRouterRequestFailedError
        ? creditLimitedRetryMaxTokens({
            error: normalizedError,
            requestedMaxTokens: outputTokenCap.maxTokens,
          })
        : null;
    if (retryMaxTokens !== null) {
      const retryRequestStartedAt = new Date();
      let retryResponse: OpenRouterResponse | null = null;
      try {
        await verifyProviderEgressLease(input);
        retryResponse = await callOpenRouter(
          input.apiKey,
          { ...request, max_tokens: retryMaxTokens },
          { signal: input.signal },
        );
        throwLeaseAbort(input);
        const content = extractAssistantContent({
          phase: input.phase,
          memberPosition: input.memberPosition,
          modelId: input.modelId,
          response: retryResponse,
        });
        const retryResponseCompletedAt = new Date();

        await recordProviderAttempt({
          requestStartedAt: retryRequestStartedAt,
          requestMaxOutputTokens: retryMaxTokens,
          responseCompletedAt: retryResponseCompletedAt,
          response: retryResponse,
          billingLookupStatus: retryResponse.id ? "pending" : "not_requested",
          error: null,
          errorStatus: null,
          errorCode: null,
        });

        return { ok: true as const, content };
      } catch (retryError) {
        if (retryError instanceof ClaimedJobLeaseLostError) {
          throw retryError;
        }
        throwLeaseAbort(input);
        const retryResponseCompletedAt = new Date();
        if (retryError instanceof OpenRouterRequestFailedError && retryError.response) {
          retryResponse = retryError.response;
        }
        const retryRateLimitError =
          retryError instanceof OpenRouterRequestFailedError && retryError.status === 429
            ? new OpenRouterPhaseRateLimitError({
                message: "OpenRouter rate limit exceeded",
                status: retryError.status,
              })
            : null;
        const normalizedRetryError =
          retryError instanceof Error ? retryError : new Error("OpenRouter request failed");

        await recordProviderAttempt({
          requestStartedAt: retryRequestStartedAt,
          requestMaxOutputTokens: retryMaxTokens,
          responseCompletedAt: retryResponseCompletedAt,
          response: retryResponse,
          billingLookupStatus: retryResponse?.id ? "pending" : "not_requested",
          error: normalizedRetryError,
          errorStatus:
            normalizedRetryError instanceof OpenRouterRequestFailedError
              ? normalizedRetryError.status
              : normalizedRetryError instanceof OpenRouterPhaseRateLimitError
                ? normalizedRetryError.status
                : null,
          errorCode:
            normalizedRetryError instanceof OpenRouterRequestFailedError
              ? normalizedRetryError.code
              : null,
        });

        if (retryRateLimitError) {
          return { ok: false as const, error: retryRateLimitError };
        }

        return { ok: false as const, error: normalizedRetryError };
      }
    }

    if (phaseRateLimitError) {
      return { ok: false as const, error: phaseRateLimitError };
    }

    return { ok: false as const, error: normalizedError };
  }
}
