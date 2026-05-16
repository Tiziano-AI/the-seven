import { proofModelForPosition } from "./browser-flow-model-fixtures";

const timestamp = "2026-05-12T10:00:00.000Z";

function baseProviderCallFor(input: {
  sessionId: number;
  memberPosition: number;
  phase: 1 | 2 | 3;
}) {
  return {
    id: input.sessionId * 1000 + input.memberPosition,
    sessionId: input.sessionId,
    phase: input.phase,
    memberPosition: input.memberPosition,
    requestModelId: proofModelForPosition(input.memberPosition).id,
    requestModelName: proofModelForPosition(input.memberPosition).name,
    catalogRefreshedAt: timestamp,
    sentReasoningEffort: null,
    requestSystemChars: 100,
    requestUserChars: 120,
    requestTotalChars: 220,
    requestStartedAt: 1_778_574_000_000,
    responseCompletedAt: 1_778_574_001_200,
    latencyMs: 1200,
    totalCostUsdMicros: 123,
    usagePromptTokens: 20,
    usageCompletionTokens: 22,
    usageTotalTokens: 42,
    finishReason: "stop",
    nativeFinishReason: null,
    errorMessage: null,
    choiceErrorMessage: null,
    choiceErrorCode: null,
    errorStatus: null,
    errorCode: null,
    billingLookupStatus: "succeeded",
    responseId: "generation-proof",
    createdAt: timestamp,
  };
}

/** Builds a runtime-real phase-one success row for browser proof fixtures. */
export function providerPhaseOneSuccessCallFor(input: {
  sessionId: number;
  memberPosition: number;
}) {
  const call = baseProviderCallFor({ ...input, phase: 1 });
  return {
    ...call,
    requestMaxOutputTokens: 8192,
    sentReasoningEffort: "low",
    supportedParameters: ["max_tokens", "reasoning", "response_format", "structured_outputs"],
    sentParameters: ["max_tokens", "reasoning"],
    sentProviderRequireParameters: true,
    sentProviderIgnoredProviders: ["amazon-bedrock", "azure"],
    deniedParameters: [],
    responseModel: proofModelForPosition(input.memberPosition).id,
    billedModelId: proofModelForPosition(input.memberPosition).id,
  };
}

/** Builds a runtime-real phase-two structured-output success row. */
export function providerPhaseTwoSuccessCallFor(input: {
  sessionId: number;
  memberPosition: number;
}) {
  const call = baseProviderCallFor({ ...input, phase: 2 });
  return {
    ...call,
    requestMaxOutputTokens: 16_384,
    sentReasoningEffort: "low",
    supportedParameters: ["max_tokens", "reasoning", "response_format", "structured_outputs"],
    sentParameters: ["max_tokens", "reasoning", "response_format"],
    sentProviderRequireParameters: true,
    sentProviderIgnoredProviders: ["amazon-bedrock", "azure"],
    deniedParameters: [],
    responseModel: proofModelForPosition(input.memberPosition).id,
    billedModelId: proofModelForPosition(input.memberPosition).id,
    totalCostUsdMicros: null,
    billingLookupStatus: "pending",
  };
}

/** Builds a pre-egress phase-two capability denial row. */
export function providerPreEgressDenialCallFor(input: {
  sessionId: number;
  memberPosition: number;
}) {
  const call = baseProviderCallFor({ ...input, phase: 2 });
  return {
    ...call,
    id: call.id + 500,
    requestMaxOutputTokens: null,
    supportedParameters: ["max_tokens"],
    sentParameters: [],
    deniedParameters: ["response_format", "structured_outputs"],
    sentProviderRequireParameters: false,
    sentProviderIgnoredProviders: [],
    responseModel: null,
    billedModelId: null,
    usageTotalTokens: null,
    latencyMs: null,
    totalCostUsdMicros: null,
    finishReason: null,
    errorMessage:
      "Unsupported OpenRouter parameter(s) for proof/model: response_format, structured_outputs",
    errorStatus: null,
    errorCode: null,
    billingLookupStatus: "not_requested",
    responseId: null,
  };
}

/** Builds a runtime-real upstream error row after provider egress. */
export function providerUpstreamErrorCallFor(input: { sessionId: number; memberPosition: number }) {
  const call = baseProviderCallFor({ ...input, phase: 1 });
  return {
    ...call,
    id: call.id + 700,
    requestMaxOutputTokens: 8192,
    sentReasoningEffort: "low",
    supportedParameters: ["max_tokens", "reasoning"],
    sentParameters: ["max_tokens", "reasoning"],
    deniedParameters: [],
    sentProviderRequireParameters: true,
    sentProviderIgnoredProviders: ["amazon-bedrock", "azure"],
    responseModel: null,
    billedModelId: null,
    usageTotalTokens: null,
    latencyMs: null,
    totalCostUsdMicros: null,
    finishReason: null,
    errorMessage: "OpenRouter request failed (status 429): rate limited",
    errorStatus: 429,
    errorCode: "rate_limited",
    billingLookupStatus: "not_requested",
    responseId: null,
  };
}
