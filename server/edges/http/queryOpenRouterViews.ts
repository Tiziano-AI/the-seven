import type { OpenRouterCall } from "../../../drizzle/schema";
import { getModelCacheRowById, getModelNamesByIds } from "../../stores/openrouterCacheStore";
import { memberForPosition, parseMemberPosition } from "../../../shared/domain/sevenMembers";

export type OpenRouterCallView = Readonly<{
  id: number;
  sessionId: number;
  phase: number;
  memberPosition: number;
  member: ReturnType<typeof memberForPosition>;
  requestModelId: string;
  requestModelName: string;
  responseModel: string | null;
  responseModelName: string | null;
  billedModelId: string | null;
  billedModelName: string | null;
  requestSystemChars: number;
  requestUserChars: number;
  requestTotalChars: number;
  requestModelContextLength: number | null;
  requestModelMaxCompletionTokens: number | null;
  responseModelContextLength: number | null;
  responseModelMaxCompletionTokens: number | null;
  totalCostUsdMicros: number | null;
  cacheDiscountUsdMicros: number | null;
  upstreamInferenceCostUsdMicros: number | null;
  nativeTokensPrompt: number | null;
  nativeTokensCompletion: number | null;
  nativeTokensReasoning: number | null;
  numMediaPrompt: number | null;
  numMediaCompletion: number | null;
  numSearchResults: number | null;
  finishReason: string | null;
  nativeFinishReason: string | null;
  usagePromptTokens: number | null;
  usageCompletionTokens: number | null;
  usageTotalTokens: number | null;
  choiceErrorCode: number | null;
  choiceErrorMessage: string | null;
  errorStatus: number | null;
  errorMessage: string | null;
  responseId: string | null;
  createdAt: Date;
}>;

type ModelMeta = Readonly<{ contextLength: number | null; maxCompletionTokens: number | null }>;

export async function buildOpenRouterCallViews(
  calls: ReadonlyArray<OpenRouterCall>
): Promise<ReadonlyArray<OpenRouterCallView>> {
  const callModelIds: string[] = [];
  for (const call of calls) {
    callModelIds.push(call.requestModelId);
    if (call.responseModel) callModelIds.push(call.responseModel);
    if (call.billedModelId) callModelIds.push(call.billedModelId);
  }

  const uniqueModelIds = Array.from(new Set(callModelIds));
  const modelNamesById = await getModelNamesByIds(uniqueModelIds);
  const modelMetaById = new Map<string, ModelMeta>();
  await Promise.all(
    uniqueModelIds.map(async (modelId) => {
      const row = await getModelCacheRowById(modelId);
      if (!row) return;
      modelMetaById.set(modelId, {
        contextLength: row.contextLength,
        maxCompletionTokens: row.maxCompletionTokens,
      });
    })
  );

  return calls.map((call) => {
    const memberPosition = parseMemberPosition(call.memberPosition);
    if (!memberPosition) {
      throw new Error(`Invalid memberPosition in openRouterCalls: ${call.memberPosition}`);
    }

    return {
      id: call.id,
      sessionId: call.sessionId,
      phase: call.phase,
      memberPosition: call.memberPosition,
      member: memberForPosition(memberPosition),
      requestModelId: call.requestModelId,
      requestModelName: modelNamesById.get(call.requestModelId) ?? call.requestModelId,
      responseModel: call.responseModel,
      responseModelName: call.responseModel
        ? modelNamesById.get(call.responseModel) ?? call.responseModel
        : null,
      billedModelId: call.billedModelId,
      billedModelName: call.billedModelId
        ? modelNamesById.get(call.billedModelId) ?? call.billedModelId
        : null,
      requestSystemChars: call.requestSystemChars,
      requestUserChars: call.requestUserChars,
      requestTotalChars: call.requestTotalChars,
      requestModelContextLength: modelMetaById.get(call.requestModelId)?.contextLength ?? null,
      requestModelMaxCompletionTokens:
        modelMetaById.get(call.requestModelId)?.maxCompletionTokens ?? null,
      responseModelContextLength: call.responseModel
        ? modelMetaById.get(call.responseModel)?.contextLength ?? null
        : null,
      responseModelMaxCompletionTokens: call.responseModel
        ? modelMetaById.get(call.responseModel)?.maxCompletionTokens ?? null
        : null,
      totalCostUsdMicros: call.totalCostUsdMicros,
      cacheDiscountUsdMicros: call.cacheDiscountUsdMicros,
      upstreamInferenceCostUsdMicros: call.upstreamInferenceCostUsdMicros,
      nativeTokensPrompt: call.nativeTokensPrompt,
      nativeTokensCompletion: call.nativeTokensCompletion,
      nativeTokensReasoning: call.nativeTokensReasoning,
      numMediaPrompt: call.numMediaPrompt,
      numMediaCompletion: call.numMediaCompletion,
      numSearchResults: call.numSearchResults,
      finishReason: call.finishReason,
      nativeFinishReason: call.nativeFinishReason,
      usagePromptTokens: call.usagePromptTokens,
      usageCompletionTokens: call.usageCompletionTokens,
      usageTotalTokens: call.usageTotalTokens,
      choiceErrorCode: call.choiceErrorCode,
      choiceErrorMessage: call.choiceErrorMessage,
      errorStatus: call.errorStatus,
      errorMessage: call.errorMessage,
      responseId: call.responseId,
      createdAt: call.createdAt,
    };
  });
}
