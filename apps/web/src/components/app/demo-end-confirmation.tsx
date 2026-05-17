"use client";

import { Button } from "@/components/ui/button";

/** Renders the shared confirmation gate for ending server-owned demo access. */
export function DemoEndConfirmation(props: {
  title?: string;
  body?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="panel confirm-panel">
      <div>
        <p className="m-0 font-semibold">{props.title ?? "End demo session?"}</p>
        <p className="m-0 mt-1 text-sm text-[var(--text-dim)]">
          {props.body ??
            "The server ends the demo session before the browser cookie is cleared. The workbench returns to the locked state only after the demo session closes."}
        </p>
        {props.error ? (
          <p role="alert" className="alert-danger m-0 mt-2 text-sm">
            {props.error}
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={props.onCancel} disabled={props.pending}>
          Keep demo
        </Button>
        <Button variant="danger" size="sm" onClick={props.onConfirm} disabled={props.pending}>
          {props.pending
            ? (props.pendingLabel ?? "Ending demo…")
            : (props.confirmLabel ?? "End demo session")}
        </Button>
      </div>
    </div>
  );
}
