"use client";

import {
  type CandidateId,
  isMemberPosition,
  memberForPosition,
  type PhaseCandidateEvaluation,
  type PhaseTwoEvaluation,
  phaseTwoEvaluationSchema,
} from "@the-seven/contracts";
import type { RefObject } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sigil } from "@/components/app/sigil";
import { cn } from "@/lib/utils";

export type SessionProceedingsArtifact = Readonly<{
  id: number;
  phase: number;
  memberPosition: number;
  member: Readonly<{ label: string }>;
  modelName: string;
  costUsdMicros: number | null;
  content: string;
}>;

function parsePhaseTwo(content: string): PhaseTwoEvaluation | null {
  try {
    return phaseTwoEvaluationSchema.parse(JSON.parse(content));
  } catch {
    return null;
  }
}

function candidateReviewRows(evaluation: PhaseTwoEvaluation): Array<{
  candidateId: CandidateId;
  score: number;
  review: PhaseCandidateEvaluation;
}> {
  return evaluation.ranking.map((candidateId) => ({
    candidateId,
    score: evaluation.reviews[candidateId].score,
    review: evaluation.reviews[candidateId],
  }));
}

function ReviewList(props: { title: string; items: readonly string[] }) {
  if (props.items.length === 0) {
    return null;
  }
  return (
    <div className="critique-list">
      <p className="critique-title">{props.title}</p>
      <ul>
        {props.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function PhaseTwoSummary(props: { evaluation: PhaseTwoEvaluation }) {
  return (
    <div className="panel critique-summary">
      <ReviewList
        title="Best final-answer inputs"
        items={props.evaluation.best_final_answer_inputs}
      />
      <ReviewList title="Major disagreements" items={props.evaluation.major_disagreements} />
    </div>
  );
}

/** Renders the persisted phase-1 and phase-2 proceedings with stable chip anchors. */
export function SessionProceedings(props: {
  artifacts: readonly SessionProceedingsArtifact[];
  proceedingsRef: RefObject<HTMLDivElement | null>;
  formatCost: (micros: number | null) => string;
}) {
  return (
    <div ref={props.proceedingsRef} className="space-y-4">
      {[1, 2].map((phase) => {
        const artifacts = props.artifacts.filter((artifact) => artifact.phase === phase);
        if (artifacts.length === 0) return null;
        return (
          <section key={phase} className="space-y-3">
            <h3 className="surface-title">
              {phase === 1 ? "Proceedings · Drafts" : "Proceedings · Critiques"}
            </h3>
            <div className="grid gap-3">
              {artifacts.map((artifact) => {
                const position = artifact.memberPosition;
                const anchorId = isMemberPosition(position)
                  ? `proceedings-phase${phase}-${memberForPosition(position).alias}`
                  : undefined;
                const phaseTwoEvaluation = phase === 2 ? parsePhaseTwo(artifact.content) : null;
                return (
                  <div key={artifact.id} id={anchorId} className="panel space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {isMemberPosition(position) ? (
                        <Sigil position={position} className="h-5 w-5 text-[var(--brass-soft)]" />
                      ) : null}
                      <span className="seal">{artifact.member.label}</span>
                      <span className="meta-chip meta-chip-wrap">{artifact.modelName}</span>
                      <span className="meta-chip">{props.formatCost(artifact.costUsdMicros)}</span>
                    </div>
                    {phaseTwoEvaluation ? (
                      <div className="grid gap-2">
                        <PhaseTwoSummary evaluation={phaseTwoEvaluation} />
                        {candidateReviewRows(phaseTwoEvaluation).map((row) => (
                          <div
                            key={row.candidateId}
                            className="critique-row border-t border-[var(--border)] pt-2"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="cell-id text-base">{row.candidateId}</span>
                              <span className="meta-chip">score {row.score}</span>
                            </div>
                            <ReviewList title="Strengths" items={row.review.strengths} />
                            <ReviewList title="Weaknesses" items={row.review.weaknesses} />
                            <ReviewList
                              title="Critical errors"
                              items={row.review.critical_errors}
                            />
                            <ReviewList
                              title="Missing evidence"
                              items={row.review.missing_evidence}
                            />
                            <p className="critique-title">Verdict input</p>
                            <p className="m-0 text-sm leading-6 text-[var(--text-muted)]">
                              {row.review.verdict_input}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        {phase === 2 ? (
                          <div className="alert-danger" role="status">
                            Structured critique unavailable. Raw reviewer record is preserved below;
                            use Provider Record if recovery is needed.
                          </div>
                        ) : null}
                        <div
                          className={cn(
                            "prose prose-sm max-w-none",
                            "prose-headings:mt-0 prose-p:text-[var(--foreground)]",
                          )}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {artifact.content}
                          </ReactMarkdown>
                        </div>
                      </>
                    )}
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
