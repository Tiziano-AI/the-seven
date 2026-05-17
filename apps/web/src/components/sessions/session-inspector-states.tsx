"use client";

import { Button } from "@/components/ui/button";
import { SessionInspectorMessage } from "./session-inspector-chrome";

/** Renders non-loaded inspector states without owning session data loading. */
export function SessionInspectorStateMessage(props: {
  authenticated: boolean;
  hasSessionId: boolean;
  loading: boolean;
  emptyState?: "workbench" | "archive";
  initialLoadIssue: string | null;
  onRetryInitialLoad: () => void;
}) {
  if (!props.authenticated) {
    return (
      <SessionInspectorMessage>
        Use your OpenRouter key or start a demo session to inspect runs.
      </SessionInspectorMessage>
    );
  }

  if (!props.hasSessionId) {
    return (
      <SessionInspectorMessage>
        {props.emptyState === "archive"
          ? "Select a saved run to inspect its answer."
          : "Ask a question above and the council will work here."}
      </SessionInspectorMessage>
    );
  }

  if (props.loading && !props.initialLoadIssue) {
    return <SessionInspectorMessage>Loading run…</SessionInspectorMessage>;
  }

  if (props.initialLoadIssue) {
    return (
      <SessionInspectorMessage>
        <div className="space-y-3">
          <p className="m-0 font-semibold text-[var(--text)]">Saved run could not load.</p>
          <p className="m-0 text-sm text-[var(--text-muted)]">
            The archive entry is still selected, but the detail request failed. Retry before
            treating the run as unavailable.
          </p>
          <p className="m-0 text-xs text-[var(--text-dim)]">{props.initialLoadIssue}</p>
          <div className="flex justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={props.onRetryInitialLoad}
              disabled={props.loading}
            >
              {props.loading ? "Retrying…" : "Retry run load"}
            </Button>
          </div>
        </div>
      </SessionInspectorMessage>
    );
  }

  return <SessionInspectorMessage>Run unavailable.</SessionInspectorMessage>;
}
