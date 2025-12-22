import type { SessionDetailPayload } from "@shared/domain/apiSchemas";
import { summarizeOpenRouterCalls } from "@shared/domain/usage";
export type SessionResults = SessionDetailPayload;

export type SessionTotals = Readonly<{
  totalTokens: number;
  totalCostUsdMicros: number;
  totalCostIsPartial: boolean;
  responses: number;
  reviews: number;
  hasSynthesis: boolean;
}>;

export function calculateSessionTotals(results: SessionResults | undefined): SessionTotals {
  if (!results) {
    return {
      totalTokens: 0,
      totalCostUsdMicros: 0,
      totalCostIsPartial: false,
      responses: 0,
      reviews: 0,
      hasSynthesis: false,
    };
  }

  const responses = results.responses ?? [];
  const reviews = results.reviews ?? [];

  const summary = summarizeOpenRouterCalls(results.openRouterCalls ?? []);

  return {
    totalTokens: summary.totalTokens,
    totalCostUsdMicros: summary.totalCostUsdMicros,
    totalCostIsPartial: summary.costIsPartial,
    responses: responses.length,
    reviews: reviews.length,
    hasSynthesis: results.synthesis !== null,
  };
}
