"use client";

import { isMemberPosition, isReviewerMemberPosition } from "@the-seven/contracts";
import type { RefObject } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sigil } from "@/components/app/sigil";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type SessionTrailArtifact = Readonly<{
  id: number;
  phase: number;
  memberPosition: number;
  member: Readonly<{ label: string }>;
  modelName: string;
  costUsdMicros: number | null;
  content: string;
}>;

/** Renders the persisted phase-1 and phase-2 artifacts with stable chip anchors. */
export function SessionTrail(props: {
  artifacts: readonly SessionTrailArtifact[];
  trailRef: RefObject<HTMLDivElement | null>;
  formatCost: (micros: number | null) => string;
}) {
  return (
    <div ref={props.trailRef} className="space-y-4">
      {[1, 2].map((phase) => {
        const artifacts = props.artifacts.filter((artifact) => artifact.phase === phase);
        if (artifacts.length === 0) return null;
        return (
          <section key={phase} className="space-y-3">
            <h3 className="surface-title text-xl uppercase tracking-[0.18em]">
              {phase === 1 ? "Phase 1 · Drafts" : "Phase 2 · Critiques"}
            </h3>
            <div className="grid gap-3">
              {artifacts.map((artifact) => {
                const position = artifact.memberPosition;
                const anchorId =
                  phase === 2 && isReviewerMemberPosition(position)
                    ? `rev-R${position}`
                    : undefined;
                return (
                  <div key={artifact.id} id={anchorId} className="panel space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {isMemberPosition(position) ? (
                        <Sigil position={position} className="h-5 w-5 text-[var(--gold-soft)]" />
                      ) : null}
                      <Badge>{artifact.member.label}</Badge>
                      <Badge>{artifact.modelName}</Badge>
                      <Badge>{props.formatCost(artifact.costUsdMicros)}</Badge>
                    </div>
                    <div
                      className={cn(
                        "prose prose-sm max-w-none",
                        "prose-headings:mt-0 prose-p:text-[var(--foreground)]",
                        phase === 2 && "font-mono text-xs leading-5",
                      )}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content}</ReactMarkdown>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
