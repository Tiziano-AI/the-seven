import "server-only";

import type { CouncilMemberTuning, MemberPosition } from "@the-seven/contracts";
import { parseUsdAmountToMicros } from "@the-seven/contracts";
import { createProviderCall } from "@the-seven/db";
import {
  callOpenRouter,
  fetchOpenRouterGeneration,
  normalizeCouncilMemberTuningInput,
  type OpenRouterMessage,
  type OpenRouterRequest,
  OpenRouterRequestFailedError,
  type OpenRouterResponse,
} from "../adapters/openrouter";

export class OpenRouterPhaseRateLimitError extends Error {
  readonly status: number | null;

  constructor(input: { message: string; status: number | null }) {
    super(input.message);
    this.name = "OpenRouterPhaseRateLimitError";
    this.status = input.status;
  }
}

type MessageCharCounts = Readonly<{
  systemChars: number;
  userChars: number;
  totalChars: number;
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
  tuning: CouncilMemberTuning | null;
}): OpenRouterRequest {
  return {
    model: input.modelId,
    messages: input.messages,
    ...normalizeCouncilMemberTuningInput(input.tuning),
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

async function fetchGenerationBestEffort(apiKey: string, generationId: string) {
  try {
    return await fetchOpenRouterGeneration(apiKey, generationId);
  } catch {
    return null;
  }
}

async function recordProviderCall(input: {
  sessionId: number;
  phase: 1 | 2 | 3;
  memberPosition: MemberPosition;
  modelId: string;
  messages: ReadonlyArray<OpenRouterMessage>;
  requestStartedAt: Date;
  responseCompletedAt: Date;
  response: OpenRouterResponse | null;
  generation: Awaited<ReturnType<typeof fetchGenerationBestEffort>>;
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
    errorMessage: input.error?.message ?? null,
    choiceErrorMessage: firstChoice?.error?.message ?? null,
    choiceErrorCode: firstChoice?.error?.code ?? null,
    errorStatus:
      input.error instanceof OpenRouterRequestFailedError
        ? input.error.status
        : input.error instanceof OpenRouterPhaseRateLimitError
          ? input.error.status
          : null,
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
  const request = buildOpenRouterRequest({
    modelId: input.modelId,
    messages: input.messages,
    tuning: input.tuning,
  });
  const requestStartedAt = new Date();
  let response: OpenRouterResponse | null = null;
  let generation: Awaited<ReturnType<typeof fetchGenerationBestEffort>> = null;

  try {
    response = await callOpenRouter(input.apiKey, request);
    generation = await fetchGenerationBestEffort(input.apiKey, response.id);
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
      requestStartedAt,
      responseCompletedAt,
      response,
      generation,
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
      requestStartedAt,
      responseCompletedAt,
      response,
      generation,
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
