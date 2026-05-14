import "server-only";

import { parseUsdAmountToMicros } from "@the-seven/contracts";
import {
  listProviderCalls,
  listSessionsWithPendingBilling,
  markSessionPendingBillingFailed,
  refreshSessionUsageTotals,
  updateProviderCallBillingStatus,
  updateProviderCallCost,
} from "@the-seven/db";
import { fetchOpenRouterGeneration } from "../adapters/openrouter";
import { redactErrorMessage } from "../domain/redaction";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reconciles delayed OpenRouter generation billing into stored provider-call
 * diagnostics after a terminal session. It never retries unboundedly and marks
 * unresolved rows failed after the final lookup attempt.
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
        const generation = await fetchOpenRouterGeneration(input.apiKey, responseId);
        const costMicros = parseUsdAmountToMicros(generation.total_cost);
        if (costMicros !== null) {
          await updateProviderCallCost(call.id, costMicros, generation.model ?? null);
        }
      } catch {
        if (retry === MAX_RETRIES) {
          await updateProviderCallBillingStatus(call.id, "failed");
        }
      }
    }

    await refreshSessionUsageTotals(input.sessionId);

    const updatedCalls = await listProviderCalls(input.sessionId);
    const stillMissing = updatedCalls.filter(
      (call) =>
        call.totalCostUsdMicros === null &&
        call.responseId !== null &&
        call.billingLookupStatus === "pending",
    );
    if (retry === MAX_RETRIES) {
      for (const call of stillMissing) {
        if (call.responseId !== null && call.billingLookupStatus === "pending") {
          await updateProviderCallBillingStatus(call.id, "failed");
        }
      }
    }
    if (stillMissing.length === 0 || retry === MAX_RETRIES) {
      break;
    }
    await sleep(RETRY_DELAY_MS);
  }
}

/**
 * Starts bounded billing reconciliation and turns unexpected worker failure into
 * a terminal diagnostic status for rows that cannot be recovered without the
 * request-scoped BYOK credential.
 */
export function scheduleSessionCostBackfill(input: { sessionId: number; apiKey: string }): void {
  void backfillSessionCosts(input).catch((error) => {
    const message = redactErrorMessage(error, "OpenRouter billing lookup failed");
    markSessionPendingBillingFailed(input.sessionId).catch((recoveryError) => {
      console.error(
        `[billing] failed to mark pending billing failed for session ${input.sessionId}:`,
        redactErrorMessage(recoveryError, message),
      );
    });
  });
}

/**
 * Fails stale billing rows left pending by a prior process. BYOK keys are
 * request-scoped and are not persisted, so restart recovery cannot safely replay
 * provider billing lookups.
 */
export async function failAbandonedBillingLookups(): Promise<number> {
  const sessionIds = await listSessionsWithPendingBilling();
  let failedRows = 0;
  for (const sessionId of sessionIds) {
    failedRows += await markSessionPendingBillingFailed(sessionId);
  }
  return failedRows;
}
