type FailureSessionDetail = Readonly<{
  session: Readonly<{
    status: string;
    failureKind: string | null;
  }>;
  artifacts: ReadonlyArray<unknown>;
}>;

type FailureDiagnostics = Readonly<{
  providerCalls: ReadonlyArray<
    Readonly<{
      phase: number;
      memberPosition: number;
      requestModelId: string;
      requestUserChars: number;
      requestTotalChars: number;
      errorStatus: number | null;
      finishReason: string | null;
      errorCode: string | null;
    }>
  >;
}>;

/**
 * Builds the live-proof failure summary shown when a provider-backed session
 * fails or times out before launch acceptance.
 */
export function formatTerminalSessionFailure(input: {
  label: string;
  reason: string;
  detail: FailureSessionDetail;
  diagnostics: FailureDiagnostics;
}): string {
  const providerRows = input.diagnostics.providerCalls
    .map((call) =>
      [
        `p${call.phase}`,
        `m${call.memberPosition}`,
        call.requestModelId,
        `chars:${call.requestUserChars}/${call.requestTotalChars}`,
        call.errorStatus === null ? "ok" : `error:${call.errorStatus}`,
        call.finishReason === null ? "finish:null" : `finish:${call.finishReason}`,
        call.errorCode === null ? "code:null" : `code:${call.errorCode}`,
      ].join("/"),
    )
    .join(", ");
  const lastCall = input.diagnostics.providerCalls.at(-1);

  return `${input.label} ${input.reason}. status=${input.detail.session.status}; failureKind=${
    input.detail.session.failureKind ?? "none"
  }; artifacts=${input.detail.artifacts.length}; providerCalls=${
    input.diagnostics.providerCalls.length
  }; lastCall=${
    lastCall
      ? `p${lastCall.phase}/m${lastCall.memberPosition}/${lastCall.requestModelId}/chars:${lastCall.requestUserChars}/${lastCall.requestTotalChars}/${lastCall.finishReason ?? "no-finish"}/${lastCall.errorCode ?? "no-code"}`
      : "none"
  }; calls=[${providerRows}]`;
}
