"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type SessionStatus = "pending" | "processing" | "completed" | "failed";
export type SessionAction = "continue" | "rerun" | null;

/** Renders small, reusable manuscript state chrome for the session inspector. */
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
      <span>{props.status === "pending" ? "Filed for deliberation" : "Deliberating"}</span>
      <strong>
        Reviewers entered: {props.reviewerArtifactCount} of {props.reviewerSeatCount}
      </strong>
      <span>Synthesizer pending</span>
    </div>
  );
}

/** Renders a recoverable refresh warning for stale manuscript state. */
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
        Verdict artifact missing. Open Provider Record to inspect the run receipt.
      </p>
    </Card>
  );
}

/** Renders the verdict composer attribution line. */
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

/** Renders the cost-bearing and inspection action row for an open manuscript. */
export function ManuscriptActionBar(
  props: Readonly<{
    status: SessionStatus;
    rerunOpen: boolean;
    pendingAction: SessionAction;
    loadingDiagnostics: boolean;
    hasDiagnostics: boolean;
    onToggleRerun: () => void;
    onExport: () => void;
    onLoadDiagnostics: () => void;
    onOpenProceedings: () => void;
    proceedingsOpen: boolean;
  }>,
) {
  return (
    <div className="manuscript-action-bar">
      {props.status === "completed" ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={props.onToggleRerun}
          disabled={props.pendingAction !== null}
        >
          {props.rerunOpen ? "Hide rerun docket" : "Prepare rerun"}
        </Button>
      ) : null}
      <Button variant="outline" size="sm" onClick={props.onExport}>
        Export Dossier
      </Button>
      <Button variant="secondary" size="sm" onClick={props.onLoadDiagnostics}>
        {props.loadingDiagnostics
          ? "Loading…"
          : props.hasDiagnostics
            ? "Refresh Provider Record"
            : "Provider Record"}
      </Button>
      <Button variant="outline" size="sm" onClick={props.onOpenProceedings}>
        {props.proceedingsOpen ? "Scroll to Proceedings" : "Open Proceedings"}
      </Button>
    </div>
  );
}
