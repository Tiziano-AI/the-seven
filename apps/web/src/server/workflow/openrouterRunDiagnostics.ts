import "server-only";

import type { BillingLookupStatus, MemberPosition } from "@the-seven/contracts";
import { type ClaimedJobLease, createProviderCall } from "@the-seven/db";
import type { OpenRouterMessage, OpenRouterResponse } from "../adapters/openrouter";
import { redactErrorMessage, redactText } from "../domain/redaction";

type MessageCharCounts = Readonly<{
  systemChars: number;
  userChars: number;
  totalChars: number;
}>;

type OpenRouterProviderCallRecordInput = Readonly<{
  sessionId: number;
  phase: 1 | 2 | 3;
  memberPosition: MemberPosition;
  modelId: string;
  messages: ReadonlyArray<OpenRouterMessage>;
  catalogRefreshedAt: Date | null;
  supportedParameters: ReadonlyArray<string>;
  sentParameters: ReadonlyArray<string>;
  sentReasoningEffort: string | null;
  sentProviderRequireParameters: boolean;
  sentProviderIgnoredProviders: ReadonlyArray<string>;
  deniedParameters: ReadonlyArray<string>;
  requestStartedAt: Date;
  requestMaxOutputTokens: number | null;
  responseCompletedAt: Date;
  response: OpenRouterResponse | null;
  billingLookupStatus: BillingLookupStatus;
  error: Error | null;
  errorStatus: number | null;
  errorCode: string | null;
  claimedLease?: ClaimedJobLease;
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

function redactChoiceErrorMessage(error: { message?: string | null } | undefined): string | null {
  const message = error?.message?.trim();
  return message ? redactText(message) : null;
}

function safeDiagnosticErrorCode(code: string | null): string | null {
  const text = code?.trim();
  if (!text) {
    return null;
  }
  if (/^\d{3}$/.test(text) || /^[a-z_]{1,64}$/.test(text)) {
    return text;
  }
  return "[redacted]";
}

/** Persists one OpenRouter provider-call diagnostic row after redaction. */
export async function recordOpenRouterProviderCall(input: OpenRouterProviderCallRecordInput) {
  const counts = getMessageCharCounts(input.messages);
  const firstChoice = input.response?.choices[0];

  await createProviderCall({
    sessionId: input.sessionId,
    phase: input.phase,
    memberPosition: input.memberPosition,
    requestModelId: input.modelId,
    requestMaxOutputTokens: input.requestMaxOutputTokens,
    requestSystemChars: counts.systemChars,
    requestUserChars: counts.userChars,
    requestTotalChars: counts.totalChars,
    catalogRefreshedAt: input.catalogRefreshedAt,
    supportedParametersJson: Array.from(input.supportedParameters),
    sentParametersJson: Array.from(input.sentParameters),
    sentReasoningEffort: input.sentReasoningEffort,
    sentProviderRequireParameters: input.sentProviderRequireParameters,
    sentProviderIgnoredProvidersJson: Array.from(input.sentProviderIgnoredProviders),
    deniedParametersJson: Array.from(input.deniedParameters),
    requestStartedAt: input.requestStartedAt,
    responseCompletedAt: input.responseCompletedAt,
    latencyMs: input.responseCompletedAt.getTime() - input.requestStartedAt.getTime(),
    responseId: input.response?.id ?? null,
    responseModel: input.response?.model ?? null,
    billedModelId: input.response?.model ?? null,
    totalCostUsdMicros: null,
    usagePromptTokens: input.response?.usage?.prompt_tokens ?? null,
    usageCompletionTokens: input.response?.usage?.completion_tokens ?? null,
    usageTotalTokens: input.response?.usage?.total_tokens ?? null,
    finishReason: firstChoice?.finish_reason ?? null,
    nativeFinishReason: firstChoice?.native_finish_reason ?? null,
    errorMessage: input.error ? redactErrorMessage(input.error, "OpenRouter request failed") : null,
    choiceErrorMessage: redactChoiceErrorMessage(firstChoice?.error),
    choiceErrorCode: firstChoice?.error?.code ?? null,
    errorStatus: input.errorStatus,
    errorCode: safeDiagnosticErrorCode(input.errorCode),
    billingLookupStatus: input.billingLookupStatus,
    claimedLease: input.claimedLease,
  });
}
