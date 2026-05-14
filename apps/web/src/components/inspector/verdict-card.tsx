"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { chipIdFromUrl, chipKindFromUrl, remarkChips } from "@/lib/chips";
import { cn } from "@/lib/utils";

const REMARK_PLUGINS = [remarkGfm, remarkChips];

const COMPONENTS: Components = {
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
    const elementId = kind === "candidate" ? `cand-${targetId}` : `rev-${targetId}`;
    return (
      <button
        type="button"
        className={cn("chip", kind === "reviewer" && "chip-rev")}
        data-chip-target={elementId}
        onClick={() => {
          if (typeof window === "undefined") return;
          const target = window.document.getElementById(elementId);
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }}
      >
        {children}
      </button>
    );
  },
};

export function VerdictCard(props: {
  content: string;
  trailLabel?: string;
  onOpenTrail?: () => void;
}) {
  return (
    <article className="card verdict">
      <header className="verdict-head">
        <span className="verdict-label">Verdict</span>
        <span className="verdict-rule" />
      </header>
      <div className="verdict-body">
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
          {props.content}
        </ReactMarkdown>
      </div>
      {props.onOpenTrail ? (
        <footer className="verdict-foot">
          <button type="button" className="trail-link" onClick={props.onOpenTrail}>
            {props.trailLabel ?? "Open the full reasoning trail — drafts, critiques, ranking →"}
          </button>
        </footer>
      ) : null}
    </article>
  );
}
