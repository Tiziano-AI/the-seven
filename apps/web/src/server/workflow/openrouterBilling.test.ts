import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const adapterMocks = vi.hoisted(() => ({
  fetchOpenRouterGeneration: vi.fn(),
}));
const dbMocks = vi.hoisted(() => ({
  listProviderCalls: vi.fn(),
  listSessionsWithPendingBilling: vi.fn(),
  markSessionPendingBillingFailed: vi.fn(),
  refreshSessionUsageTotals: vi.fn(),
  updateProviderCallBillingStatus: vi.fn(),
  updateProviderCallCost: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@the-seven/db", () => dbMocks);
vi.mock("../adapters/openrouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../adapters/openrouter")>();
  return {
    ...actual,
    fetchOpenRouterGeneration: adapterMocks.fetchOpenRouterGeneration,
  };
});

import {
  backfillSessionCosts,
  failAbandonedBillingLookups,
  scheduleSessionCostBackfill,
} from "./openrouterBilling";

describe("OpenRouter billing backfill", () => {
  beforeEach(() => {
    for (const mock of [
      adapterMocks.fetchOpenRouterGeneration,
      dbMocks.listProviderCalls,
      dbMocks.listSessionsWithPendingBilling,
      dbMocks.markSessionPendingBillingFailed,
      dbMocks.refreshSessionUsageTotals,
      dbMocks.updateProviderCallBillingStatus,
      dbMocks.updateProviderCallCost,
    ]) {
      mock.mockReset();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("backfills successful provider call costs after OpenRouter billing materializes", async () => {
    vi.useFakeTimers();
    dbMocks.listProviderCalls
      .mockResolvedValueOnce([
        {
          id: 31,
          totalCostUsdMicros: null,
          responseId: "generation-cost-1",
          billingLookupStatus: "pending",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 31,
          totalCostUsdMicros: 123,
          responseId: "generation-cost-1",
          billingLookupStatus: "succeeded",
        },
      ]);
    adapterMocks.fetchOpenRouterGeneration.mockResolvedValue({
      id: "generation-cost-1",
      model: "provider/billed-model",
      total_cost: "0.000123",
    });

    const backfill = backfillSessionCosts({ sessionId: 40, apiKey: "sk-or-secret" });
    await vi.advanceTimersByTimeAsync(30_000);
    await backfill;

    expect(adapterMocks.fetchOpenRouterGeneration).toHaveBeenCalledWith(
      "sk-or-secret",
      "generation-cost-1",
    );
    expect(dbMocks.updateProviderCallCost).toHaveBeenCalledWith(31, 123, "provider/billed-model");
    expect(dbMocks.refreshSessionUsageTotals).toHaveBeenCalledWith(40);
    expect(dbMocks.updateProviderCallBillingStatus).not.toHaveBeenCalled();
  });

  test("marks unresolved provider billing rows failed after bounded retries", async () => {
    vi.useFakeTimers();
    const pending = {
      id: 32,
      totalCostUsdMicros: null,
      responseId: "generation-cost-2",
      billingLookupStatus: "pending",
    };
    dbMocks.listProviderCalls
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([{ ...pending, billingLookupStatus: "failed" }]);
    adapterMocks.fetchOpenRouterGeneration.mockRejectedValue(new Error("billing not ready"));

    const backfill = backfillSessionCosts({ sessionId: 41, apiKey: "sk-or-secret" });
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    await backfill;

    expect(adapterMocks.fetchOpenRouterGeneration).toHaveBeenCalledTimes(3);
    expect(dbMocks.updateProviderCallBillingStatus).toHaveBeenCalledTimes(1);
    expect(dbMocks.updateProviderCallBillingStatus).toHaveBeenCalledWith(32, "failed");
    expect(dbMocks.refreshSessionUsageTotals).toHaveBeenCalledTimes(3);
  });

  test("fails abandoned pending billing rows on startup recovery", async () => {
    dbMocks.listSessionsWithPendingBilling.mockResolvedValue([51, 52]);
    dbMocks.markSessionPendingBillingFailed.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const failedRows = await failAbandonedBillingLookups();

    expect(failedRows).toBe(3);
    expect(dbMocks.markSessionPendingBillingFailed).toHaveBeenCalledWith(51);
    expect(dbMocks.markSessionPendingBillingFailed).toHaveBeenCalledWith(52);
  });

  test("scheduled billing backfill marks pending rows failed after unexpected worker failure", async () => {
    vi.useFakeTimers();
    dbMocks.listProviderCalls.mockRejectedValue(new Error("database unavailable"));
    dbMocks.markSessionPendingBillingFailed.mockResolvedValue(1);

    scheduleSessionCostBackfill({ sessionId: 53, apiKey: "sk-or-secret" });
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => {
      expect(dbMocks.markSessionPendingBillingFailed).toHaveBeenCalledWith(53);
    });
  });
});
