import "server-only";

import type { CouncilMemberTuning, MemberPosition } from "@the-seven/contracts";
import { parseUsdAmountToMicros, phaseTwoEvaluationResponseFormat } from "@the-seven/contracts";
import {
  createProviderCall,
  listProviderCalls,
  refreshSessionUsageTotals,
  updateProviderCallCost,
} from "@the-seven/db";
import {
  callOpenRouter,
  fetchOpenRouterGeneration,
  materializeCouncilMemberTuningInput,
  type OpenRouterMessage,
  type OpenRouterRequest,
  OpenRouterRequestFailedError,
  type OpenRouterResponse,
  type OpenRouterResponseFormat,
} from "../adapters/openrouter";
import { redactErrorMessage } from "../domain/redaction";
import { getModelCapability } from "../services/models";

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

type MessageCharCounts = Readonly<{
  systemChars: number;
  userChars: number;
  totalChars: number;
}>;

type PhaseResponseFormat = Readonly<{
  options: Readonly<{
    response_format?: OpenRouterResponseFormat;
    provider?: Readonly<{ require_parameters: true }>;
  }>;
  sentParameters: string[];
  deniedParameters: string[];
}>;

function getMessageCharCounts(messages: ReadonlyArray<OpenRouterMessage>): MessageCharCounts {
  let systemChars = 0;
  let userChars = 0;
  let totalChars = 0;

  for (const message of messages) {
    const size = message.content.length;
    totalChars += size;
    if (message.role === "system") {
      systemChars += size;
    }
    if (message.role === "user") {
      userChars += size;
    }
  }

  return { systemChars, userChars, totalChars };
}

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
      message: firstChoice.error.message || "OpenRouter rate limit exceeded",
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
  if (!supported.has("response_format") || !supported.has("structured_outputs")) {
    return {
      options: {},
      sentParameters: [],
      deniedParameters: ["response_format"],
    };
  }

  return {
    options: {
      response_format: phaseTwoEvaluationResponseFormat,
      provider: { require_parameters: true },
    },
    sentParameters: ["response_format"],
    deniedParameters: [],
  };
}

async function fetchGenerationBestEffort(apiKey: string, generationId: string) {
  try {
    return await fetchOpenRouterGeneration(apiKey, generationId);
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * After a session completes, OpenRouter needs time to compute billing.
 * This function waits, then re-fetches generation data for all provider
 * calls that are missing cost, and updates the DB.
 */
export async function backfillSessionCosts(input: { sessionId: number; apiKey: string }) {
  const BILLING_DELAY_MS = 30_000;
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 15_000;

  await sleep(BILLING_DELAY_MS);

  for (let retry = 0; retry <= MAX_RETRIES; retry += 1) {
    const calls = await listProviderCalls(input.sessionId);
    const missing = calls.filter(
      (call) => call.totalCostUsdMicros === null && call.responseId !== null,
    );
    if (missing.length === 0) {
      break;
    }

    for (const call of missing) {
      const responseId = call.responseId;
      if (!responseId) continue;
      try {
        const gen = await fetchOpenRouterGeneration(input.apiKey, responseId);
        const costMicros = parseUsdAmountToMicros(gen.total_cost);
        if (costMicros !== null) {
          await updateProviderCallCost(call.id, costMicros, gen.model ?? null);
        }
      } catch {
        // Individual call cost fetch failed — continue with others
      }
    }

    await refreshSessionUsageTotals(input.sessionId);

    const updatedCalls = await listProviderCalls(input.sessionId);
    const stillMissing = updatedCalls.filter((c) => c.totalCostUsdMicros === null);
    if (stillMissing.length === 0 || retry === MAX_RETRIES) {
      break;
    }
    await sleep(RETRY_DELAY_MS);
  }
}

async function recordProviderCall(input: {
  sessionId: number;
  phase: 1 | 2 | 3;
  memberPosition: MemberPosition;
  modelId: string;
  messages: ReadonlyArray<OpenRouterMessage>;
  catalogRefreshedAt: Date | null;
  supportedParameters: ReadonlyArray<string>;
  sentParameters: ReadonlyArray<string>;
  deniedParameters: ReadonlyArray<string>;
  requestStartedAt: Date;
  responseCompletedAt: Date;
  response: OpenRouterResponse | null;
  generation: Awaited<ReturnType<typeof fetchGenerationBestEffort>>;
  billingLookupStatus: string;
  error: Error | null;
}) {
  const counts = getMessageCharCounts(input.messages);
  const firstChoice = input.response?.choices[0];

  await createProviderCall({
    sessionId: input.sessionId,
    phase: input.phase,
    memberPosition: input.memberPosition,
    requestModelId: input.modelId,
    requestSystemChars: counts.systemChars,
    requestUserChars: counts.userChars,
    requestTotalChars: counts.totalChars,
    catalogRefreshedAt: input.catalogRefreshedAt,
    supportedParametersJson: Array.from(input.supportedParameters),
    sentParametersJson: Array.from(input.sentParameters),
    deniedParametersJson: Array.from(input.deniedParameters),
    requestStartedAt: input.requestStartedAt,
    responseCompletedAt: input.responseCompletedAt,
    latencyMs: input.responseCompletedAt.getTime() - input.requestStartedAt.getTime(),
    responseId: input.response?.id ?? null,
    responseModel: input.response?.model ?? null,
    billedModelId: input.generation?.model ?? input.response?.model ?? null,
    totalCostUsdMicros: parseUsdAmountToMicros(input.generation?.total_cost),
    usagePromptTokens: input.response?.usage?.prompt_tokens ?? null,
    usageCompletionTokens: input.response?.usage?.completion_tokens ?? null,
    usageTotalTokens: input.response?.usage?.total_tokens ?? null,
    finishReason: firstChoice?.finish_reason ?? null,
    nativeFinishReason: firstChoice?.native_finish_reason ?? null,
    errorMessage: input.error ? redactErrorMessage(input.error, "OpenRouter request failed") : null,
    choiceErrorMessage: firstChoice?.error?.message
      ? redactErrorMessage(firstChoice.error, "OpenRouter choice failed")
      : null,
    choiceErrorCode: firstChoice?.error?.code ?? null,
    errorStatus:
      input.error instanceof OpenRouterRequestFailedError
        ? input.error.status
        : input.error instanceof OpenRouterPhaseRateLimitError
          ? input.error.status
          : null,
    errorCode: input.error instanceof OpenRouterRequestFailedError ? input.error.code : null,
    billingLookupStatus: input.billingLookupStatus,
  });
}

export async function runOpenRouterPhaseCall(input: {
  sessionId: number;
  phase: 1 | 2 | 3;
  memberPosition: MemberPosition;
  apiKey: string;
  modelId: string;
  messages: ReadonlyArray<OpenRouterMessage>;
  tuning: CouncilMemberTuning | null;
}) {
  const capability = await getModelCapability(input.modelId);
  const supportedParameters = capability?.supportedParameters ?? [];
  const materialized = materializeCouncilMemberTuningInput(input.tuning, supportedParameters);
  const phaseResponseFormat = materializePhaseResponseFormat({
    phase: input.phase,
    supportedParameters,
  });
  const request = buildOpenRouterRequest({
    modelId: input.modelId,
    messages: input.messages,
    tuningOptions: {
      ...materialized.options,
      ...phaseResponseFormat.options,
    },
  });
  const requestStartedAt = new Date();
  let response: OpenRouterResponse | null = null;
  let generation: Awaited<ReturnType<typeof fetchGenerationBestEffort>> = null;
  let billingLookupStatus = "not_requested";

  const deniedParameters = [
    ...materialized.deniedParameters,
    ...phaseResponseFormat.deniedParameters,
  ];
  const sentParameters = [...materialized.sentParameters, ...phaseResponseFormat.sentParameters];

  if (!capability || deniedParameters.length > 0) {
    const responseCompletedAt = new Date();
    const error = new OpenRouterUnsupportedParameterError({
      modelId: input.modelId,
      deniedParameters: capability ? deniedParameters : ["model"],
    });
    await recordProviderCall({
      sessionId: input.sessionId,
      phase: input.phase,
      memberPosition: input.memberPosition,
      modelId: input.modelId,
      messages: input.messages,
      catalogRefreshedAt: capability?.refreshedAt ?? null,
      supportedParameters,
      sentParameters: [],
      deniedParameters: capability ? deniedParameters : ["model"],
      requestStartedAt,
      responseCompletedAt,
      response: null,
      generation: null,
      billingLookupStatus,
      error,
    });
    return { ok: false as const, error };
  }

  try {
    response = await callOpenRouter(input.apiKey, request);
    generation = await fetchGenerationBestEffort(input.apiKey, response.id);
    billingLookupStatus = generation ? "succeeded" : "failed";
    const content = extractAssistantContent({
      phase: input.phase,
      memberPosition: input.memberPosition,
      modelId: input.modelId,
      response,
    });
    const responseCompletedAt = new Date();

    await recordProviderCall({
      sessionId: input.sessionId,
      phase: input.phase,
      memberPosition: input.memberPosition,
      modelId: input.modelId,
      messages: input.messages,
      catalogRefreshedAt: capability.refreshedAt,
      supportedParameters,
      sentParameters,
      deniedParameters,
      requestStartedAt,
      responseCompletedAt,
      response,
      generation,
      billingLookupStatus,
      error: null,
    });

    return { ok: true as const, content };
  } catch (error) {
    const responseCompletedAt = new Date();
    const normalizedError = error instanceof Error ? error : new Error("OpenRouter request failed");

    await recordProviderCall({
      sessionId: input.sessionId,
      phase: input.phase,
      memberPosition: input.memberPosition,
      modelId: input.modelId,
      messages: input.messages,
      catalogRefreshedAt: capability.refreshedAt,
      supportedParameters,
      sentParameters,
      deniedParameters,
      requestStartedAt,
      responseCompletedAt,
      response,
      generation,
      billingLookupStatus,
      error: normalizedError,
    });

    if (error instanceof OpenRouterRequestFailedError && error.status === 429) {
      return {
        ok: false as const,
        error: new OpenRouterPhaseRateLimitError({
          message: "OpenRouter rate limit exceeded",
          status: error.status,
        }),
      };
    }

    return {
      ok: false as const,
      error: normalizedError,
    };
  }
}
