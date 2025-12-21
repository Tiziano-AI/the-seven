import {
  callOpenRouter,
  fetchOpenRouterGeneration,
  OpenRouterRequestFailedError,
  type OpenRouterGeneration,
  type OpenRouterMessage,
  type OpenRouterResponse,
} from "../adapters/openrouter/client";
import { errorToLogFields, log } from "../_core/log";
import {
  formatOpenRouterChatPreflightErrorForUser,
  preflightOpenRouterChatCompletion,
} from "../services/openrouterPreflight";
import { createOpenRouterCall } from "../stores/openRouterCallStore";
import type { CouncilMemberTuning } from "../../shared/domain/councilMemberTuning";
import { memberForPosition, type MemberPosition } from "../../shared/domain/sevenMembers";
import { parseUsdAmountToMicros } from "../../shared/domain/usage";

const MAX_PROVIDER_ATTEMPTS = 3;
const IS_TEST = process.env.NODE_ENV === "test";

type MessageCharCounts = Readonly<{
  systemChars: number;
  userChars: number;
  totalChars: number;
}>;

function getMessageCharCounts(messages: ReadonlyArray<Readonly<{ role: string; content: string }>>): MessageCharCounts {
  let systemChars = 0;
  let userChars = 0;
  let totalChars = 0;
  for (const message of messages) {
    const size = message.content.length;
    totalChars += size;
    if (message.role === "system") systemChars += size;
    if (message.role === "user") userChars += size;
  }
  return { systemChars, userChars, totalChars };
}

function sleepMs(ms: number): Promise<void> {
  if (ms <= 0 || IS_TEST) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function backoffDelayMs(attempt: number): number {
  const baseMs = 250;
  const maxMs = 1200;
  const exponential = baseMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(maxMs, exponential);
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(capped * 0.25)));
  return capped + jitter;
}

function isRetryableStatus(status: number | null): boolean {
  if (status === null) return true;
  if (status === 408 || status === 429) return true;
  return status >= 500 && status <= 599;
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof OpenRouterRequestFailedError)) return false;
  return isRetryableStatus(error.status);
}

function getChoiceError(response: OpenRouterResponse): OpenRouterResponse["choices"][number]["error"] | null {
  const firstChoice = response.choices[0];
  return firstChoice?.error ?? null;
}

function isRetryableChoiceError(
  error: OpenRouterResponse["choices"][number]["error"] | null
): boolean {
  if (!error) return false;
  return isRetryableStatus(error.code);
}

async function recordOpenRouterCallBestEffort(params: {
  traceId: string;
  sessionId: number;
  phase: 1 | 2 | 3;
  memberPosition: MemberPosition;
  requestModelId: string;
  messages: ReadonlyArray<Readonly<{ role: string; content: string }>>;
  response: OpenRouterResponse | null;
  generation: OpenRouterGeneration | null;
  error: unknown | null;
}): Promise<void> {
  const { systemChars, userChars, totalChars } = getMessageCharCounts(params.messages);
  const firstChoice = params.response?.choices[0] ?? null;

  const billedModelId =
    params.generation?.model ?? params.response?.model ?? params.requestModelId;

  const totalCostUsdMicros = parseUsdAmountToMicros(params.generation?.total_cost);
  const cacheDiscountUsdMicros = parseUsdAmountToMicros(params.generation?.cache_discount);
  const upstreamInferenceCostUsdMicros = parseUsdAmountToMicros(
    params.generation?.upstream_inference_cost
  );

  const errorStatus = params.error instanceof OpenRouterRequestFailedError ? params.error.status : null;

  const errorMessage =
    params.error && params.error instanceof Error
      ? params.error.message
      : params.error
        ? "Unknown error"
        : null;

  try {
    await createOpenRouterCall({
      sessionId: params.sessionId,
      phase: params.phase,
      memberPosition: params.memberPosition,
      requestModelId: params.requestModelId,
      requestSystemChars: systemChars,
      requestUserChars: userChars,
      requestTotalChars: totalChars,
      responseId: params.response?.id,
      responseModel: params.response?.model,
      billedModelId,
      totalCostUsdMicros: totalCostUsdMicros ?? undefined,
      cacheDiscountUsdMicros: cacheDiscountUsdMicros ?? undefined,
      upstreamInferenceCostUsdMicros: upstreamInferenceCostUsdMicros ?? undefined,
      nativeTokensPrompt: params.generation?.native_tokens_prompt ?? undefined,
      nativeTokensCompletion: params.generation?.native_tokens_completion ?? undefined,
      nativeTokensReasoning: params.generation?.native_tokens_reasoning ?? undefined,
      numMediaPrompt: params.generation?.num_media_prompt ?? undefined,
      numMediaCompletion: params.generation?.num_media_completion ?? undefined,
      numSearchResults: params.generation?.num_search_results ?? undefined,
      finishReason: firstChoice?.finish_reason ?? undefined,
      nativeFinishReason: firstChoice?.native_finish_reason ?? undefined,
      usagePromptTokens: params.response?.usage?.prompt_tokens,
      usageCompletionTokens: params.response?.usage?.completion_tokens,
      usageTotalTokens: params.response?.usage?.total_tokens,
      choiceErrorCode: firstChoice?.error?.code ?? undefined,
      choiceErrorMessage: firstChoice?.error?.message ?? undefined,
      errorStatus: errorStatus ?? undefined,
      errorMessage: errorMessage ?? undefined,
    });
  } catch (error: unknown) {
    log("warn", "openrouter_call_record_failed", {
      trace_id: params.traceId,
      session_id: params.sessionId,
      phase: params.phase,
      member_position: params.memberPosition,
      model_id: params.requestModelId,
      ...errorToLogFields(error),
    });
  }
}

async function fetchGenerationBestEffort(params: {
  traceId: string;
  sessionId: number;
  apiKey: string;
  generationId: string;
}): Promise<OpenRouterGeneration | null> {
  try {
    return await fetchOpenRouterGeneration(params.apiKey, params.generationId);
  } catch (error: unknown) {
    log("warn", "openrouter_generation_fetch_failed", {
      trace_id: params.traceId,
      session_id: params.sessionId,
      generation_id: params.generationId,
      ...errorToLogFields(error),
    });
    return null;
  }
}

export type OpenRouterCallAttemptResult =
  | Readonly<{ ok: true; response: OpenRouterResponse; content: string }>
  | Readonly<{ ok: false; error: Error }>;

function extractNonEmptyAssistantContent(params: {
  phase: 1 | 2 | 3;
  memberPosition: MemberPosition;
  requestModelId: string;
  response: OpenRouterResponse;
}): Readonly<{ ok: true; content: string } | { ok: false; error: Error }> {
  const formatFinishReason = (finishReason: string | null | undefined): string => {
    if (finishReason === null) return "null";
    if (finishReason === undefined) return "missing";
    return finishReason;
  };

  const formatChoiceError = (
    error: OpenRouterResponse["choices"][number]["error"] | undefined
  ): string | null => {
    if (!error) return null;
    return `choice_error=${String(error.code)}:${error.message}`;
  };

  const firstChoice = params.response.choices[0];
  if (!firstChoice) {
    return {
      ok: false,
      error: new Error(
        `Empty model output: OpenRouter returned 0 choices (response_id=${params.response.id}) (phase ${params.phase}, member ${memberForPosition(params.memberPosition).alias}, model ${params.requestModelId})`
      ),
    };
  }

  const finishReason = formatFinishReason(firstChoice.finish_reason);
  const nativeFinishReason = formatFinishReason(firstChoice.native_finish_reason);
  const choiceError = formatChoiceError(firstChoice.error);
  const finishInfoParts = [
    `finish_reason=${finishReason}`,
    `native_finish_reason=${nativeFinishReason}`,
    choiceError,
  ].filter((part) => part !== null);
  const finishInfo = finishInfoParts.join(", ");

  const content = firstChoice.message.content;
  if (content === null) {
    return {
      // When tool calling occurs, OpenRouter can return message.content=null.
      // This system requires a text payload for every phase; treat this as a hard failure.
      ok: false,
      error: new Error(
        `Empty model output: OpenRouter returned message.content=null (${finishInfo}) (response_id=${params.response.id}) (phase ${params.phase}, member ${memberForPosition(params.memberPosition).alias}, model ${params.requestModelId})`
      ),
    };
  }

  if (content.trim().length === 0) {
    return {
      ok: false,
      error: new Error(
        `Empty model output: OpenRouter returned an empty message.content (after trimming) (${finishInfo}) (response_id=${params.response.id}) (phase ${params.phase}, member ${memberForPosition(params.memberPosition).alias}, model ${params.requestModelId})`
      ),
    };
  }

  return { ok: true, content };
}

export async function runOpenRouterCallWithPreflight(params: {
  traceId: string;
  sessionId: number;
  phase: 1 | 2 | 3;
  memberPosition: MemberPosition;
  apiKey: string;
  modelId: string;
  messages: ReadonlyArray<OpenRouterMessage>;
  tuning: CouncilMemberTuning | null;
  }): Promise<OpenRouterCallAttemptResult> {
    const preflight = await preflightOpenRouterChatCompletion({
      modelId: params.modelId,
      messages: params.messages,
      tuning: params.tuning,
    });
  if (!preflight.ok) {
    const error = new Error(
      `OpenRouter request validation failed: ${formatOpenRouterChatPreflightErrorForUser(preflight.error)}`
    );
    await recordOpenRouterCallBestEffort({
      traceId: params.traceId,
      sessionId: params.sessionId,
      phase: params.phase,
      memberPosition: params.memberPosition,
      requestModelId: params.modelId,
      messages: params.messages,
      response: null,
      generation: null,
      error,
    });
    return { ok: false, error };
  }

  for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt += 1) {
    let response: OpenRouterResponse | null = null;
    let generation: OpenRouterGeneration | null = null;
    try {
      response = await callOpenRouter(params.apiKey, preflight.request);
      generation = await fetchGenerationBestEffort({
        traceId: params.traceId,
        sessionId: params.sessionId,
        apiKey: params.apiKey,
        generationId: response.id,
      });

      const content = extractNonEmptyAssistantContent({
        phase: params.phase,
        memberPosition: params.memberPosition,
        requestModelId: params.modelId,
        response,
      });

      const choiceError = getChoiceError(response);
      const retryableChoiceError = isRetryableChoiceError(choiceError);

      await recordOpenRouterCallBestEffort({
        traceId: params.traceId,
        sessionId: params.sessionId,
        phase: params.phase,
        memberPosition: params.memberPosition,
        requestModelId: params.modelId,
        messages: params.messages,
        response,
        generation,
        error: content.ok ? null : content.error,
      });

      if (content.ok) {
        return { ok: true, response, content: content.content };
      }

      if (retryableChoiceError && attempt < MAX_PROVIDER_ATTEMPTS) {
        await sleepMs(backoffDelayMs(attempt));
        continue;
      }

      return { ok: false, error: content.error };
    } catch (error: unknown) {
      await recordOpenRouterCallBestEffort({
        traceId: params.traceId,
        sessionId: params.sessionId,
        phase: params.phase,
        memberPosition: params.memberPosition,
        requestModelId: params.modelId,
        messages: params.messages,
        response,
        generation,
        error,
      });

      if (isRetryableError(error) && attempt < MAX_PROVIDER_ATTEMPTS) {
        await sleepMs(backoffDelayMs(attempt));
        continue;
      }

      return {
        ok: false,
        error: error instanceof Error ? error : new Error("OpenRouter request failed"),
      };
    }
  }

  return { ok: false, error: new Error("OpenRouter request failed after retries") };
}
