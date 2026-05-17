"use client";

import { isMemberPosition, memberForPosition } from "@the-seven/contracts";
import { Sigil } from "@/components/app/sigil";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SessionDiagnosticProviderCall = Readonly<{
  id: number;
  phase: number;
  memberPosition: number;
  requestModelId: string;
  requestModelName: string;
  requestMaxOutputTokens: number | null;
  supportedParameters: readonly string[];
  sentParameters: readonly string[];
  deniedParameters: readonly string[];
  sentReasoningEffort: string | null;
  sentProviderRequireParameters: boolean;
  sentProviderIgnoredProviders: readonly string[];
  responseModel: string | null;
  billedModelId: string | null;
  usageTotalTokens: number | null;
  latencyMs: number | null;
  totalCostUsdMicros: number | null;
  finishReason: string | null;
  nativeFinishReason: string | null;
  errorMessage: string | null;
  choiceErrorMessage: string | null;
  errorStatus: number | null;
  errorCode: string | null;
  billingLookupStatus: "not_requested" | "pending" | "succeeded" | "failed";
  responseId: string | null;
}>;

function formatList(values: readonly string[]): string {
  return values.length ? values.join(", ") : "none";
}

function memberLabel(position: number): string {
  if (!isMemberPosition(position)) {
    return `Seat ${position}`;
  }
  const member = memberForPosition(position);
  return member.role === "synthesizer"
    ? `${member.alias} · Synthesizer`
    : `${member.alias} · Reviewer`;
}

function formatLatency(latencyMs: number | null): string {
  return latencyMs === null ? "pending" : `${latencyMs} ms`;
}

function formatBillingLookupStatus(status: SessionDiagnosticProviderCall["billingLookupStatus"]) {
  if (status === "not_requested") return "not requested";
  return status;
}

function hasExecutionIssue(call: SessionDiagnosticProviderCall): boolean {
  return (
    call.errorMessage !== null ||
    call.choiceErrorMessage !== null ||
    call.errorStatus !== null ||
    call.deniedParameters.length > 0
  );
}

function hasUnsettledBilling(call: SessionDiagnosticProviderCall): boolean {
  return call.billingLookupStatus === "pending" || call.billingLookupStatus === "failed";
}

function hasAcceptedOutput(call: SessionDiagnosticProviderCall): boolean {
  return !hasExecutionIssue(call) && call.responseModel !== null;
}

function ProviderIdLine(props: { label: string; value: string | null; fallback: string }) {
  return (
    <span>
      {props.label}{" "}
      {props.value ? <span className="diagnostic-mono">{props.value}</span> : props.fallback}
    </span>
  );
}

function recordState(call: SessionDiagnosticProviderCall): "accepted" | "issue" | "settlement" {
  if (hasExecutionIssue(call) || call.billingLookupStatus === "failed") {
    return "issue";
  }
  if (hasUnsettledBilling(call)) {
    return "settlement";
  }
  return "accepted";
}

function providerRecordSummary(calls: readonly SessionDiagnosticProviderCall[]): string {
  const acceptedCount = calls.filter(hasAcceptedOutput).length;
  const issueCount = calls.filter(hasExecutionIssue).length;
  const unsettledBillingCount = calls.filter(hasUnsettledBilling).length;
  if (calls.length === 0) {
    return "No model calls were recorded for this run.";
  }
  if (issueCount === 0 && unsettledBillingCount === 0) {
    return `${acceptedCount} accepted model output${acceptedCount === 1 ? "" : "s"} recorded for this run; no failed, denied, or unsettled attempts are present.`;
  }
  const issueText =
    issueCount === 0
      ? ""
      : ` ${issueCount} failed or denied attempt${issueCount === 1 ? "" : "s"} need attention and are receipts, not accepted answer evidence.`;
  const unsettledText =
    unsettledBillingCount === 0
      ? ""
      : ` ${unsettledBillingCount} billing settlement${unsettledBillingCount === 1 ? "" : "s"} ${
          unsettledBillingCount === 1 ? "remains" : "remain"
        } unsettled; cost evidence is not final.`;
  return `${acceptedCount} accepted model output${acceptedCount === 1 ? "" : "s"} recorded.${issueText}${unsettledText}`;
}

/** Renders provider-call diagnostics without owning session orchestration state. */
export function SessionDiagnosticsTable(props: {
  providerCalls: readonly SessionDiagnosticProviderCall[];
  formatCost: (micros: number | null) => string;
}) {
  return (
    <Card
      id="run-details-panel"
      className="p-6"
      tabIndex={-1}
      role="region"
      aria-labelledby="run-details-heading"
    >
      <h3 id="run-details-heading" className="surface-title mb-4">
        Run details
      </h3>
      <p className="diagnostic-summary">{providerRecordSummary(props.providerCalls)}</p>
      <ul className="diagnostic-ledger" aria-label="Run details">
        {props.providerCalls.map((call) => {
          const state = recordState(call);
          return (
            <li
              key={call.id}
              className={cn(
                "diagnostic-card",
                state === "issue" && "diagnostic-card-error",
                state === "settlement" && "diagnostic-card-settlement",
              )}
            >
              <header className="diagnostic-card-head">
                <span className="diagnostic-seat" title={`member position ${call.memberPosition}`}>
                  {isMemberPosition(call.memberPosition) ? (
                    <Sigil position={call.memberPosition} className="diagnostic-seat-sigil" />
                  ) : null}
                  <span>{memberLabel(call.memberPosition)}</span>
                </span>
                <span className={state === "issue" ? "seal seal-danger" : "meta-chip"}>
                  {state === "issue"
                    ? `Phase ${call.phase} · Needs attention`
                    : state === "settlement"
                      ? `Phase ${call.phase} · Settlement pending`
                      : `Phase ${call.phase}`}
                </span>
              </header>
              <dl className="diagnostic-grid">
                <div>
                  <dt>Requested model</dt>
                  <dd>
                    <span className="diagnostic-primary">{call.requestModelName}</span>
                    <span className="diagnostic-mono">{call.requestModelId}</span>
                  </dd>
                </div>
                <div>
                  <dt>Capability admission</dt>
                  <dd>
                    <span>max output {call.requestMaxOutputTokens ?? "not sent"}</span>
                    <span>reasoning effort {call.sentReasoningEffort ?? "not sent"}</span>
                    <span>sent {formatList(call.sentParameters)}</span>
                    <span>supported {formatList(call.supportedParameters)}</span>
                    <span>denied {formatList(call.deniedParameters)}</span>
                  </dd>
                </div>
                <div>
                  <dt>Model route</dt>
                  <dd>
                    <span>require params {call.sentProviderRequireParameters ? "yes" : "no"}</span>
                    <span>ignored {formatList(call.sentProviderIgnoredProviders)}</span>
                    <ProviderIdLine
                      label="response"
                      value={call.responseModel}
                      fallback="not returned"
                    />
                    <ProviderIdLine
                      label="billed"
                      value={call.billedModelId}
                      fallback="not settled"
                    />
                  </dd>
                </div>
                <div>
                  <dt>Usage</dt>
                  <dd>
                    <span>tokens {call.usageTotalTokens ?? "pending"}</span>
                    <span>latency {formatLatency(call.latencyMs)}</span>
                    <span>cost {props.formatCost(call.totalCostUsdMicros)}</span>
                  </dd>
                </div>
                <div>
                  <dt>Response</dt>
                  <dd>
                    <span>finish {call.finishReason ?? call.nativeFinishReason ?? "pending"}</span>
                    <span>billing {formatBillingLookupStatus(call.billingLookupStatus)}</span>
                    <span>id {call.responseId ?? "not returned"}</span>
                  </dd>
                </div>
                <div>
                  <dt>Error</dt>
                  <dd>
                    <span>{call.errorMessage ?? call.choiceErrorMessage ?? "none"}</span>
                    <span>status {call.errorStatus ?? "none"}</span>
                    <span>code {call.errorCode ?? "none"}</span>
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
