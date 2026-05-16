type FailureSessionDetail = Readonly<{
  session: Readonly<{
    status: string;
    failureKind: string | null;
  }>;
  artifacts: ReadonlyArray<unknown>;
  terminalError: string | null;
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
      billingLookupStatus: string;
    }>
  >;
}>;

const billingStatusOrder = ["succeeded", "pending", "failed", "not_requested"] as const;

function formatBillingSummary(providerCalls: FailureDiagnostics["providerCalls"]): string {
  const counts = new Map<string, number>();
  for (const call of providerCalls) {
    counts.set(call.billingLookupStatus, (counts.get(call.billingLookupStatus) ?? 0) + 1);
  }
  const ordered = billingStatusOrder
    .filter((status) => counts.has(status))
    .map((status) => `${status}:${counts.get(status)}`);
  const other = [...counts.entries()]
    .filter(
      ([status]) => !billingStatusOrder.includes(status as (typeof billingStatusOrder)[number]),
    )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status}:${count}`);
  return [...ordered, ...other].join(",") || "none";
}

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
        `billing:${call.billingLookupStatus}`,
      ].join("/"),
    )
    .join(", ");
  const lastCall = input.diagnostics.providerCalls.at(-1);

  return `${input.label} ${input.reason}. status=${input.detail.session.status}; failureKind=${
    input.detail.session.failureKind ?? "none"
  }; terminalError=${input.detail.terminalError ?? "none"}; artifacts=${input.detail.artifacts.length}; providerCalls=${
    input.diagnostics.providerCalls.length
  }; billing=${formatBillingSummary(input.diagnostics.providerCalls)}; lastCall=${
    lastCall
      ? `p${lastCall.phase}/m${lastCall.memberPosition}/${lastCall.requestModelId}/chars:${lastCall.requestUserChars}/${lastCall.requestTotalChars}/${lastCall.finishReason ?? "no-finish"}/${lastCall.errorCode ?? "no-code"}/billing:${lastCall.billingLookupStatus}`
      : "none"
  }; calls=[${providerRows}]`;
}
