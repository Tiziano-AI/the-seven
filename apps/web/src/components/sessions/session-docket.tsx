"use client";

import { SessionStatusBadge } from "./status-badge";

type SessionStatus = "pending" | "processing" | "completed" | "failed";

function formatIngressSource(source: string): string {
  if (source === "web") return "Web petition";
  if (source === "cli") return "CLI petition";
  if (source === "api") return "API petition";
  return "Unknown ingress";
}

/** Renders the manuscript docket header and live evidence totals for the active session. */
export function SessionDocket(props: {
  councilName: string;
  latencyLabel: string | null;
  ingressSource: string;
  lastRefreshedAt: number | null;
  status: SessionStatus;
  failureKind: string | null;
  exhibitLabel: string;
  tokenEvidenceLabel: string;
  costEvidenceLabel: string;
  query: string;
}) {
  return (
    <section className="docket">
      <p className="docket-meta">
        <span>Matter filed with</span> <span className="docket-accent">{props.councilName}</span>
        {props.latencyLabel ? (
          <span className="docket-meta-pair">
            <span className="docket-dot">·</span>
            <span>{props.latencyLabel}</span>
          </span>
        ) : null}
        <span className="docket-meta-pair">
          <span className="docket-dot">·</span>
          <span>{formatIngressSource(props.ingressSource)}</span>
        </span>
        {props.lastRefreshedAt ? (
          <span className="docket-meta-pair">
            <span className="docket-dot">·</span>
            <span>
              refreshed{" "}
              {new Intl.DateTimeFormat("en", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }).format(new Date(props.lastRefreshedAt))}
            </span>
          </span>
        ) : null}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SessionStatusBadge status={props.status} failureKind={props.failureKind} />
        <span className="meta-chip">{props.exhibitLabel}</span>
        <span className="meta-chip">{props.tokenEvidenceLabel}</span>
        <span className="meta-chip">{props.costEvidenceLabel}</span>
      </div>
      <div>
        <h2 className="docket-question-label">Docketed matter</h2>
        <p className="docket-question">{props.query}</p>
      </div>
    </section>
  );
}
