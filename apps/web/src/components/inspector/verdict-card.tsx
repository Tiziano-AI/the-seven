"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { chipIdFromUrl, chipKindFromUrl, remarkChips } from "@/lib/chips";
import { cn } from "@/lib/utils";

const REMARK_PLUGINS = [remarkGfm, remarkChips];

function reviewerTarget(id: string | null): { targetId: string; fallbackId: string } | null {
  if (!id?.startsWith("R")) {
    return null;
  }
  const position = Number.parseInt(id.slice(1), 10);
  if (!Number.isInteger(position) || position < 1 || position > 6) {
    return null;
  }
  const alias = String.fromCharCode(64 + position);
  return {
    targetId: `proceedings-phase2-${alias}`,
    fallbackId: `proceedings-phase1-${alias}`,
  };
}

function candidateTarget(id: string | null): { targetId: string; fallbackId: string } | null {
  if (!id || !/^[A-F]$/.test(id)) {
    return null;
  }
  return {
    targetId: `proceedings-phase1-${id}`,
    fallbackId: `cand-${id}`,
  };
}

function chipActionLabel(kind: "candidate" | "reviewer", targetId: string | null): string {
  if (kind === "candidate" && targetId) {
    return `Open candidate ${targetId} draft in How it worked`;
  }
  if (kind === "reviewer" && targetId) {
    return `Open reviewer ${targetId} critique in How it worked`;
  }
  return "Open evidence in How it worked";
}

function buildComponents(
  onOpenEvidenceTarget?: (targetId: string, fallbackId?: string) => void,
): Components {
  return {
    a({ href, children, ...rest }) {
      const kind = chipKindFromUrl(href);
      if (!kind) {
        return (
          <a href={href} {...rest}>
            {children}
          </a>
        );
      }
      const targetId = href ? chipIdFromUrl(href) : null;
      const reviewerEvidence = kind === "reviewer" ? reviewerTarget(targetId) : null;
      const candidateEvidence = kind === "candidate" ? candidateTarget(targetId) : null;
      const evidenceTarget = reviewerEvidence ?? candidateEvidence;
      const elementId = evidenceTarget?.targetId ?? `cand-${targetId}`;
      return (
        <button
          type="button"
          className={cn("chip", kind === "reviewer" && "chip-rev")}
          data-chip-target={elementId}
          aria-label={chipActionLabel(kind, targetId)}
          onClick={() => {
            if (onOpenEvidenceTarget) {
              onOpenEvidenceTarget(elementId, evidenceTarget?.fallbackId);
              return;
            }
            if (typeof window === "undefined") return;
            window.document
              .getElementById(elementId)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        >
          {children}
        </button>
      );
    },
  };
}

export function VerdictCard(props: {
  content: string;
  proceedingsLabel?: string;
  onOpenEvidenceTarget?: (targetId: string, fallbackId?: string) => void;
  onOpenProceedings?: () => void;
}) {
  return (
    <article className="card verdict">
      <header className="verdict-head">
        <h2 className="verdict-label">Answer</h2>
        <span className="verdict-rule" />
      </header>
      <p className="verdict-note">
        The final answer weighs cited evidence and correctness; reviewer rankings are not a vote.
      </p>
      <div className="verdict-body">
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          components={buildComponents(props.onOpenEvidenceTarget)}
        >
          {props.content}
        </ReactMarkdown>
      </div>
      {props.onOpenProceedings ? (
        <footer className="verdict-foot">
          <button type="button" className="proceedings-link" onClick={props.onOpenProceedings}>
            {props.proceedingsLabel ?? "See how it worked"}
          </button>
        </footer>
      ) : null}
    </article>
  );
}
