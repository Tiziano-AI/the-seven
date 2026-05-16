"use client";

import { Button } from "@/components/ui/button";
import { SessionInspectorMessage } from "./session-inspector-chrome";

/** Renders non-manuscript inspector states without owning session data loading. */
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
        Unlock BYOK or start a demo session to inspect runs.
      </SessionInspectorMessage>
    );
  }

  if (!props.hasSessionId) {
    return (
      <SessionInspectorMessage>
        {props.emptyState === "archive"
          ? "Select an archived matter to inspect its manuscript."
          : "File a matter above and the council will assemble here."}
      </SessionInspectorMessage>
    );
  }

  if (props.loading && !props.initialLoadIssue) {
    return <SessionInspectorMessage>Loading manuscript…</SessionInspectorMessage>;
  }

  if (props.initialLoadIssue) {
    return (
      <SessionInspectorMessage>
        <div className="space-y-3">
          <p className="m-0 font-semibold text-[var(--text)]">Manuscript could not load.</p>
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
              {props.loading ? "Retrying…" : "Retry manuscript load"}
            </Button>
          </div>
        </div>
      </SessionInspectorMessage>
    );
  }

  return <SessionInspectorMessage>Manuscript unavailable.</SessionInspectorMessage>;
}
