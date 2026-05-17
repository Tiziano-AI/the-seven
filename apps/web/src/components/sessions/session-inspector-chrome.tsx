"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type SessionStatus = "pending" | "processing" | "completed" | "failed";
export type SessionAction = "continue" | "rerun" | null;
export type InspectorMode = "answer" | "how" | "council" | "details" | "exports" | "rerun";

const INSPECTOR_MODES: ReadonlyArray<{
  value: InspectorMode;
  label: string;
  description: string;
}> = [
  { value: "answer", label: "Answer", description: "Read the result or recovery state." },
  { value: "how", label: "How it worked", description: "Open drafts and critiques on demand." },
  { value: "council", label: "Council", description: "See the seven seats for this run." },
  { value: "details", label: "Run details", description: "Inspect model calls and billing state." },
  { value: "exports", label: "Exports", description: "Copy, download, or save a private link." },
  { value: "rerun", label: "Run again", description: "Edit the question and choose a council." },
];

/** Renders small, reusable run-state chrome for the session inspector. */
export function SessionInspectorMessage(props: Readonly<{ children: ReactNode }>) {
  return <Card className="p-8 text-center text-sm text-[var(--text-muted)]">{props.children}</Card>;
}

/** Renders the pending/processing run progress ledger. */
export function SessionProgressRibbon(
  props: Readonly<{
    status: "pending" | "processing";
    reviewerArtifactCount: number;
    reviewerSeatCount: number;
  }>,
) {
  return (
    <div className="panel progress-ribbon" role="status">
      <span>{props.status === "pending" ? "Question sent" : "Council working"}</span>
      <strong>
        Reviewers entered: {props.reviewerArtifactCount} of {props.reviewerSeatCount}
      </strong>
      <span>Synthesizer pending</span>
    </div>
  );
}

/** Renders a recoverable refresh warning for stale run state. */
export function SessionRefreshIssuePanel(
  props: Readonly<{ issue: string; onRefresh: () => void }>,
) {
  return (
    <div className="panel confirm-panel" role="status">
      <p className="m-0 text-sm text-[var(--text-muted)]">{props.issue}</p>
      <Button variant="secondary" size="sm" onClick={props.onRefresh}>
        Refresh status
      </Button>
    </div>
  );
}

/** Renders the completed-state fallback when the synthesis artifact is unavailable. */
export function MissingVerdictArtifactCard() {
  return (
    <Card className="p-6">
      <p className="text-sm text-[var(--text-muted)]">
        Answer text is missing. Open Run details to inspect the run receipt.
      </p>
    </Card>
  );
}

/** Renders the final-answer composer attribution line. */
export function SynthesizerCredit(
  props: Readonly<{
    modelId: string | undefined;
    modelLabel: string | null;
    latencyLabel: string | null;
  }>,
) {
  return (
    <p className="composer">
      <span>composed by</span> <span className="composer-strong">Synthesizer&nbsp;G</span>
      {props.modelLabel ? (
        <>
          <span className="composer-dot">·</span>
          <span className="composer-strong" title={props.modelId}>
            {props.modelLabel}
          </span>
        </>
      ) : null}
      {props.latencyLabel ? (
        <>
          <span className="composer-dot">·</span>
          <span>{props.latencyLabel}</span>
        </>
      ) : null}
    </p>
  );
}

/** Renders the stable mode rail for one loaded run. */
export function SessionModeRail(
  props: Readonly<{
    status: SessionStatus;
    pendingAction: SessionAction;
    loadingDiagnostics: boolean;
    hasDiagnostics: boolean;
    activeMode: InspectorMode;
    onSelectMode: (mode: InspectorMode) => void;
  }>,
) {
  return (
    <div className="manuscript-action-bar">
      {INSPECTOR_MODES.map((mode) => {
        const disabled =
          mode.value === "rerun" && props.status !== "completed" && props.status !== "failed";
        const loading = mode.value === "details" && props.loadingDiagnostics;
        return (
          <button
            key={mode.value}
            type="button"
            className={
              props.activeMode === mode.value
                ? "inspector-mode inspector-mode-active"
                : "inspector-mode"
            }
            aria-busy={loading || undefined}
            aria-label={mode.label}
            aria-pressed={props.activeMode === mode.value}
            aria-describedby={`inspector-mode-${mode.value}-description`}
            disabled={disabled || props.pendingAction !== null || loading}
            onClick={() => props.onSelectMode(mode.value)}
          >
            <span>{mode.label}</span>
            <span id={`inspector-mode-${mode.value}-description`} className="sr-only">
              {mode.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Renders direct repeat actions beside the answer without moving the mode rail. */
export function AnswerRepeatActions(
  props: Readonly<{
    status: SessionStatus;
    pendingAction: SessionAction;
    onAskAnother: () => void;
    onRunAgain: () => void;
  }>,
) {
  return (
    <div className="answer-repeat-actions">
      <Button variant="secondary" size="sm" onClick={props.onAskAnother}>
        Ask another question
      </Button>
      {props.status === "completed" || props.status === "failed" ? (
        <Button
          variant="outline"
          size="sm"
          onClick={props.onRunAgain}
          disabled={props.pendingAction !== null}
        >
          Edit and run again
        </Button>
      ) : null}
    </div>
  );
}
