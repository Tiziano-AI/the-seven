"use client";

import { formatFailureKind } from "@/components/sessions/session-inspector-formatters";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Renders failed-run recovery truth before any cost-bearing continuation action. */
export function SessionRecoveryLedger(props: {
  artifactCount: number;
  reviewCount: number;
  failureKind: string | null;
  terminalError: string | null;
  councilName: string;
  rerunOpen: boolean;
  continuing: boolean;
  actionPending: boolean;
  onContinue: () => void;
  onRunAgain: () => void;
}) {
  const artifactLabel = `${props.artifactCount} artifact${props.artifactCount === 1 ? "" : "s"}`;
  const critiqueLabel = `${props.reviewCount} critique${props.reviewCount === 1 ? "" : "s"}`;
  const preservedSummary =
    props.artifactCount === 0
      ? "No artifacts were preserved before failure."
      : props.reviewCount > 0
        ? `${artifactLabel} preserved, including ${critiqueLabel}.`
        : `${artifactLabel} preserved before failure.`;
  const continueSummary =
    props.artifactCount === 0
      ? `Reuse ${props.councilName} and the original run snapshot; execute from the first missing call with the active key or demo quota.`
      : `Reuse ${props.councilName} and the preserved phase output; execute only the missing calls with the active key or demo quota.`;
  return (
    <Card className="p-6 recovery-ledger">
      <div>
        <h2 className="docket-question-label">Recovery record</h2>
        <p className="m-0 mt-2 text-sm leading-6 text-[var(--text-muted)]">
          The council did not produce an answer. {preservedSummary}
        </p>
      </div>
      <dl className="recovery-grid">
        <div>
          <dt>Failure</dt>
          <dd>{formatFailureKind(props.failureKind)}</dd>
        </div>
        {props.terminalError ? (
          <div>
            <dt>Terminal note</dt>
            <dd>
              <span>
                Final server note from the failed job. Open Run details for matching model-call
                receipts and diagnostics.
              </span>
              <span className="terminal-evidence-line">{props.terminalError}</span>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Original council</dt>
          <dd>{props.councilName}</dd>
        </div>
        <div>
          <dt>Continue</dt>
          <dd>{continueSummary}</dd>
        </div>
        <div>
          <dt>Run again</dt>
          <dd>
            Create a new run with the original council selected when available, then edit the
            question or choose another council before starting it.
          </dd>
        </div>
      </dl>
      <div className="recovery-actions">
        <Button size="sm" onClick={props.onContinue} disabled={props.actionPending}>
          {props.continuing ? "Continuing…" : "Continue this run"}
        </Button>
        <Button variant="ghost" size="sm" onClick={props.onRunAgain} disabled={props.actionPending}>
          {props.rerunOpen ? "Run again is open" : "Edit and run again"}
        </Button>
      </div>
    </Card>
  );
}
