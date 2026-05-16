"use client";

import {
  isMemberPosition,
  isReviewerMemberPosition,
  type MemberPosition,
  memberForPosition,
  phaseTwoEvaluationSchema,
} from "@the-seven/contracts";
import { Sigil } from "@/components/app/sigil";
import { readableModelLabel } from "@/lib/model-labels";
import { cn } from "@/lib/utils";

export type InspectorSnapshotMember = Readonly<{
  memberPosition: number;
  model: Readonly<{ modelId: string }>;
}>;

export type InspectorArtifact = Readonly<{
  id: number;
  phase: number;
  memberPosition: number;
  member: Readonly<{ label: string }>;
  modelId: string;
  modelName: string;
  content: string;
}>;

type CandidateId = "A" | "B" | "C" | "D" | "E" | "F";
type ProceedingsStatus = "pending" | "processing" | "completed" | "failed";
const candidateIds: readonly CandidateId[] = ["A", "B", "C", "D", "E", "F"];

type SeatState = Readonly<{
  position: MemberPosition;
  alias: string;
  roleLabel: string;
  modelLabel: string;
  modelId: string;
  vote: string;
  voteAccent: "default" | "dissent" | "pending" | "synth";
}>;

function isCandidateId(value: string): value is CandidateId {
  return candidateIds.some((candidateId) => candidateId === value);
}

function reviewerVote(artifact: InspectorArtifact | null): {
  top: CandidateId | null;
  invalid: boolean;
} {
  if (!artifact) {
    return { top: null, invalid: false };
  }
  try {
    const parsed = phaseTwoEvaluationSchema.parse(JSON.parse(artifact.content));
    const top = parsed.ranking[0];
    return { top: isCandidateId(top) ? top : null, invalid: false };
  } catch {
    return { top: null, invalid: true };
  }
}

function rankingMode(values: ReadonlyArray<CandidateId>) {
  const counts = new Map<CandidateId, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let topCount = 0;
  for (const count of counts.values()) {
    if (count > topCount) {
      topCount = count;
    }
  }
  const topIds = candidateIds.filter((candidateId) => counts.get(candidateId) === topCount);
  return { topIds, topCount, total: values.length };
}

function markedCandidateList(candidates: ReadonlyArray<CandidateId>): string {
  const firstCandidate = candidates[0];
  if (!firstCandidate) {
    return "";
  }
  if (candidates.length === 1) {
    return `§${firstCandidate}§`;
  }
  const marked = candidates.map((candidate) => `§${candidate}§`);
  return `${marked.slice(0, -1).join(", ")} and ${marked[marked.length - 1]}`;
}

function reviewSignalLine(
  votes: ReadonlyArray<CandidateId>,
  expectedReviewerCount: number,
): string {
  if (votes.length === 0) {
    return "Reviewers convening";
  }
  const { topIds, topCount, total } = rankingMode(votes);
  if (topIds.length === 0) {
    return "Reviewers convening";
  }
  const firstTopId = topIds[0];
  if (!firstTopId) {
    return "Reviewers convening";
  }
  if (total === 1) {
    return `1 of ${expectedReviewerCount} reviewer rankings entered · strongest signal §${firstTopId}§`;
  }
  if (topIds.length > 1) {
    const splitLabel = `split rankings: ${topCount} each for ${markedCandidateList(topIds)}`;
    if (total < expectedReviewerCount) {
      return `${total} of ${expectedReviewerCount} reviewer rankings entered · ${splitLabel}`;
    }
    return `All ${expectedReviewerCount} reviewer rankings entered · ${splitLabel}`;
  }
  const topId = firstTopId;
  const dissentCount = total - topCount;
  const leaderLabel =
    topCount === 1 ? "1 reviewer ranking points to" : `${topCount} reviewer rankings point to`;
  const dissentLabel =
    dissentCount === 1 ? "1 dissenting ranking" : `${dissentCount} dissenting rankings`;
  if (total < expectedReviewerCount) {
    return `${total} of ${expectedReviewerCount} reviewer rankings entered · ${leaderLabel} §${topId}§ · ${dissentLabel}`;
  }
  if (dissentCount === 0) {
    return `All ${expectedReviewerCount} reviewer rankings point to §${topId}§`;
  }
  return `${leaderLabel} §${topId}§ · ${dissentLabel}`;
}

function renderMarkedCandidate(line: string) {
  return line.split(/§([A-G])§/g).map((segment, index) => {
    const key = `${segment}-${index}`;
    return index % 2 === 1 ? (
      <strong key={key}>{segment}</strong>
    ) : (
      <span key={key}>{segment}</span>
    );
  });
}

function buildSeats(
  members: ReadonlyArray<InspectorSnapshotMember>,
  artifacts: ReadonlyArray<InspectorArtifact>,
  status: ProceedingsStatus,
): { seats: SeatState[]; reviewerVotes: CandidateId[]; reviewerCount: number } {
  const phase1ByPosition = new Map<number, InspectorArtifact>();
  const phase2ByPosition = new Map<number, InspectorArtifact>();
  const phase3ByPosition = new Map<number, InspectorArtifact>();
  for (const artifact of artifacts) {
    if (artifact.phase === 1) {
      phase1ByPosition.set(artifact.memberPosition, artifact);
    } else if (artifact.phase === 2) {
      phase2ByPosition.set(artifact.memberPosition, artifact);
    } else if (artifact.phase === 3) {
      phase3ByPosition.set(artifact.memberPosition, artifact);
    }
  }

  const reviewerVotes: CandidateId[] = [];
  const draftSeats: SeatState[] = [];
  let reviewerCount = 0;

  for (const memberSnapshot of members) {
    const position = memberSnapshot.memberPosition;
    if (!isMemberPosition(position)) {
      continue;
    }
    const member = memberForPosition(position);
    const readableModel = readableModelLabel(memberSnapshot.model.modelId);
    const roleLabel = member.role === "synthesizer" ? "Synthesizer" : "Reviewer";

    if (isReviewerMemberPosition(position)) {
      reviewerCount += 1;
      const artifact = phase2ByPosition.get(position) ?? null;
      const draft = phase1ByPosition.get(position) ?? null;
      const result = reviewerVote(artifact);
      if (result.top) {
        reviewerVotes.push(result.top);
      }
      const missingVote =
        status === "failed"
          ? draft
            ? "draft preserved"
            : "not reached"
          : status === "pending"
            ? "not reached"
            : status === "completed"
              ? "review missing"
              : "deliberating";
      draftSeats.push({
        position,
        alias: member.alias,
        roleLabel,
        modelLabel: readableModel,
        modelId: memberSnapshot.model.modelId,
        vote: artifact
          ? result.top
            ? `ranks §${result.top}§ first`
            : "review needs recovery"
          : missingVote,
        voteAccent: artifact
          ? result.invalid
            ? "dissent"
            : "default"
          : status === "completed"
            ? "dissent"
            : "pending",
      });
    } else {
      const synthesis = phase3ByPosition.get(position) ?? null;
      const synthesizerVote = synthesis
        ? "verdict entered"
        : status === "failed"
          ? "not reached"
          : status === "completed"
            ? "verdict missing"
            : "awaiting verdict";
      draftSeats.push({
        position,
        alias: member.alias,
        roleLabel,
        modelLabel: readableModel,
        modelId: memberSnapshot.model.modelId,
        vote: synthesizerVote,
        voteAccent: synthesis || status !== "failed" ? "synth" : "pending",
      });
    }
  }

  const { topIds } = rankingMode(reviewerVotes);
  const topId = topIds.length === 1 ? (topIds[0] ?? null) : null;
  const seats = draftSeats.map((seat) => {
    if (seat.voteAccent !== "default" || !topId) {
      return seat;
    }
    const cellTop = seat.vote.match(/§([A-F])§/)?.[1];
    return cellTop && cellTop !== topId ? { ...seat, voteAccent: "dissent" as const } : seat;
  });
  return { seats, reviewerVotes, reviewerCount };
}

/** Renders the seven-seat proceedings state for one persisted session. */
export function CouncilTrack(props: {
  members: ReadonlyArray<InspectorSnapshotMember>;
  artifacts: ReadonlyArray<InspectorArtifact>;
  status: ProceedingsStatus;
  onCellSelect?: (memberPosition: MemberPosition) => void;
}) {
  const { seats, reviewerVotes, reviewerCount } = buildSeats(
    props.members,
    props.artifacts,
    props.status,
  );

  return (
    <section className="track" aria-label="Council proceedings">
      <header className="track-head">
        <h2 className="track-caption">Proceedings</h2>
        <p className="track-review-signal">
          {renderMarkedCandidate(reviewSignalLine(reviewerVotes, reviewerCount))}
        </p>
      </header>
      <ol className="track-grid">
        {seats.map((seat) => {
          const isClickable = Boolean(props.onCellSelect);
          const seatNode = (
            <>
              <span className="cell-topline">
                <Sigil position={seat.position} className="cell-sigil" />
                <span className="cell-id">{seat.alias}</span>
              </span>
              <span className="cell-role">{seat.roleLabel}</span>
              <span className="cell-label">{seat.modelLabel}</span>
              <span className="cell-model" title={seat.modelId}>
                {seat.modelId}
              </span>
              <span className="cell-vote">{renderMarkedCandidate(seat.vote)}</span>
            </>
          );
          const className = cn(
            "panel cell",
            seat.voteAccent === "synth" && "cell-synth",
            seat.voteAccent === "dissent" && "cell-dissent",
            seat.voteAccent === "pending" && "cell-vacant",
            isClickable && "cell-button",
          );

          if (isClickable) {
            return (
              <li key={seat.position}>
                <button
                  type="button"
                  className={className}
                  id={`cand-${seat.alias}`}
                  onClick={() => props.onCellSelect?.(seat.position)}
                >
                  {seatNode}
                </button>
              </li>
            );
          }

          return (
            <li key={seat.position} id={`cand-${seat.alias}`} className={className}>
              {seatNode}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
