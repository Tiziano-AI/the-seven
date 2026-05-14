import { describe, expect, it } from "vitest";
import { formatTerminalSessionFailure } from "./live-session-diagnostics";

describe("live terminal session diagnostics", () => {
  it("formats failed session state with provider-call context", () => {
    expect(
      formatTerminalSessionFailure({
        label: "BYOK commons session",
        reason: "failed",
        detail: {
          session: { status: "failed", failureKind: "phase2_inference_failed" },
          artifacts: [{ id: 1 }],
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
            },
          ],
        },
      }),
    ).toBe(
      "BYOK commons session failed. status=failed; failureKind=phase2_inference_failed; artifacts=1; providerCalls=1; lastCall=p2/m5/provider/model/chars:1234/1500/length/rate_limited; calls=[p2/m5/provider/model/chars:1234/1500/error:429/finish:length/code:rate_limited]",
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
        },
        diagnostics: { providerCalls: [] },
      }),
    ).toBe(
      "Demo session timed out. status=processing; failureKind=none; artifacts=0; providerCalls=0; lastCall=none; calls=[]",
    );
  });
});
