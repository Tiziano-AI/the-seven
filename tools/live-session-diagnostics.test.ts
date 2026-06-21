import { PHASE_TWO_REVIEW_LIST_MAX_ITEMS } from "@the-seven/contracts";
import { describe, expect, it } from "vitest";
import { formatTerminalSessionFailure } from "./live-session-diagnostics";

describe("live terminal session diagnostics", () => {
  it("formats failed session state with provider-call context", () => {
    const terminalError = `Phase 2 evaluation is invalid: strengths must contain at most ${PHASE_TWO_REVIEW_LIST_MAX_ITEMS} items`;

    expect(
      formatTerminalSessionFailure({
        label: "BYOK commons session",
        reason: "failed",
        detail: {
          session: { status: "failed", failureKind: "phase2_inference_failed" },
          artifacts: [{ id: 1 }],
          terminalError,
        },
        diagnostics: {
          providerCalls: [
            {
              phase: 2,
              memberPosition: 5,
              requestModelId: "provider/model",
              requestUserChars: 1234,
              requestTotalChars: 1500,
              errorStatus: 429,
              finishReason: "length",
              errorCode: "rate_limited",
              billingLookupStatus: "pending",
            },
          ],
        },
      }),
    ).toBe(
      `BYOK commons session failed. status=failed; failureKind=phase2_inference_failed; terminalError=${terminalError}; artifacts=1; providerCalls=1; billing=pending:1; lastCall=p2/m5/provider/model/chars:1234/1500/length/rate_limited/billing:pending; calls=[p2/m5/provider/model/chars:1234/1500/error:429/finish:length/code:rate_limited/billing:pending]`,
    );
  });

  it("formats timed-out sessions without provider rows", () => {
    expect(
      formatTerminalSessionFailure({
        label: "Demo session",
        reason: "timed out",
        detail: {
          session: { status: "processing", failureKind: null },
          artifacts: [],
          terminalError: null,
        },
        diagnostics: { providerCalls: [] },
      }),
    ).toBe(
      "Demo session timed out. status=processing; failureKind=none; terminalError=none; artifacts=0; providerCalls=0; billing=none; lastCall=none; calls=[]",
    );
  });
});
