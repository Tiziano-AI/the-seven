"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type SessionExportAction =
  | "copy-answer"
  | "copy-notes"
  | "copy-link"
  | "download-answer"
  | "download-record"
  | null;

function actionLabel(action: SessionExportAction) {
  if (action === "copy-answer") return "Copying answer";
  if (action === "copy-notes") return "Copying notes";
  if (action === "copy-link") return "Copying private link";
  if (action === "download-answer") return "Downloading answer";
  if (action === "download-record") return "Downloading full record";
  return null;
}

/** Renders copy, link, and download controls for one loaded run. */
export function SessionExportPanel(props: {
  hasAnswer: boolean;
  busyAction: SessionExportAction;
  onCopyAnswer: () => void;
  onCopyAnswerWithNotes: () => void;
  onCopyLink: () => void;
  onDownloadAnswer: () => void;
  onDownloadFullRecord: () => void;
}) {
  const busyLabel = actionLabel(props.busyAction);
  const busy = props.busyAction !== null;
  return (
    <Card id="exports-panel" className="p-6" tabIndex={-1}>
      <div className="export-panel-head">
        <div>
          <h2 className="surface-title">Copy and download</h2>
          <p className="m-0 mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Keep the useful answer close. The link reopens this run for you; use downloads when
            sharing outside this account.
          </p>
        </div>
        {busyLabel ? (
          <span role="status" className="meta-chip">
            {busyLabel}…
          </span>
        ) : null}
      </div>
      <div className="export-action-grid">
        <Button
          type="button"
          variant="secondary"
          disabled={!props.hasAnswer || busy}
          onClick={props.onCopyAnswer}
        >
          Copy answer
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!props.hasAnswer || busy}
          onClick={props.onCopyAnswerWithNotes}
        >
          Copy answer with notes
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={props.onCopyLink}>
          Copy private link
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!props.hasAnswer || busy}
          onClick={props.onDownloadAnswer}
        >
          Download answer
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={props.onDownloadFullRecord}
        >
          Download full record
        </Button>
      </div>
    </Card>
  );
}
