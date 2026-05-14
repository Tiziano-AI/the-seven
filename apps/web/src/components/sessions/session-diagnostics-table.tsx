"use client";

import { Card } from "@/components/ui/card";

export type SessionDiagnosticProviderCall = Readonly<{
  id: number;
  phase: number;
  memberPosition: number;
  requestModelName: string;
  billedModelId: string | null;
  usageTotalTokens: number | null;
  latencyMs: number | null;
  totalCostUsdMicros: number | null;
  finishReason: string | null;
  nativeFinishReason: string | null;
  errorMessage: string | null;
  choiceErrorMessage: string | null;
}>;

/** Renders provider-call diagnostics without owning session orchestration state. */
export function SessionDiagnosticsTable(props: {
  providerCalls: readonly SessionDiagnosticProviderCall[];
  formatCost: (micros: number | null) => string;
}) {
  return (
    <Card className="p-6">
      <h3 className="surface-title mb-4 text-xl uppercase tracking-[0.18em]">Diagnostics</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
              <th className="pb-2">Phase</th>
              <th className="pb-2">Member</th>
              <th className="pb-2">Request Model</th>
              <th className="pb-2">Billed Model</th>
              <th className="pb-2">Tokens</th>
              <th className="pb-2">Latency</th>
              <th className="pb-2">Cost</th>
              <th className="pb-2">Finish</th>
              <th className="pb-2">Error</th>
            </tr>
          </thead>
          <tbody>
            {props.providerCalls.map((call) => (
              <tr key={call.id} className="border-b border-[var(--border)]/60 align-top">
                <td className="py-3">{call.phase}</td>
                <td className="py-3">{call.memberPosition}</td>
                <td className="py-3">{call.requestModelName}</td>
                <td className="py-3">{call.billedModelId ?? "n/a"}</td>
                <td className="py-3">{call.usageTotalTokens ?? "n/a"}</td>
                <td className="py-3">{call.latencyMs ?? "n/a"}</td>
                <td className="py-3">{props.formatCost(call.totalCostUsdMicros)}</td>
                <td className="py-3">{call.finishReason ?? call.nativeFinishReason ?? "n/a"}</td>
                <td className="py-3">{call.errorMessage ?? call.choiceErrorMessage ?? "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
