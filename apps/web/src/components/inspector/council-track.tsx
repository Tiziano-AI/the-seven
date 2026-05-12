"use client";

import {
  type CandidateId,
  candidateIdSchema,
  isMemberPosition,
  isReviewerMemberPosition,
  type MemberPosition,
  memberForPosition,
  phaseTwoEvaluationSchema,
  type ReviewerMemberPosition,
} from "@the-seven/contracts";
import { Sigil } from "@/components/app/sigil";
import { cn } from "@/lib/utils";

export type InspectorArtifact = Readonly<{
  id: number;
  phase: number;
  memberPosition: number;
  member: { label: string };
  modelId: string;
  modelName: string;
  content: string;
}>;

export type InspectorSnapshotMember = Readonly<{
  memberPosition: number;
  model: { provider: string; modelId: string };
}>;

type VoteAccent = "default" | "dissent" | "synth" | "vacant";

type CellState = {
  position: MemberPosition;
  alias: string;
  modelName: string;
  vote: string;
  voteAccent: VoteAccent;
};

function aliasFor(position: MemberPosition): string {
  return memberForPosition(position).alias;
}

function reviewerVote(evaluationArtifact: InspectorArtifact | null): {
  top: CandidateId | null;
  raw: string;
} {
  if (!evaluationArtifact) {
    return { top: null, raw: "deliberating" };
  }
  try {
    const parsed = JSON.parse(evaluationArtifact.content);
    const evaluation = phaseTwoEvaluationSchema.parse(parsed);
    const top = evaluation.ranking[0];
    return { top, raw: top };
  } catch {
    return { top: null, raw: "—" };
  }
}

function selfAliasOf(reviewerPosition: ReviewerMemberPosition): CandidateId {
  return candidateIdSchema.parse(aliasFor(reviewerPosition));
}

function modeOf(values: ReadonlyArray<CandidateId>) {
  const counts = new Map<CandidateId, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let topId: CandidateId | null = null;
  let topCount = 0;
  for (const [id, count] of counts.entries()) {
    if (count > topCount) {
      topCount = count;
      topId = id;
    }
  }
  return { topId, topCount, total: values.length };
}

function consensusLine(votes: ReadonlyArray<CandidateId>): string {
  if (votes.length === 0) {
    return "Deliberation pending";
  }
  const { topId, topCount, total } = modeOf(votes);
  if (!topId) {
    return "Deliberation pending";
  }
  const dissentCount = total - topCount;
  if (dissentCount === 0) {
    return `All ${total} converge on §${topId}§`;
  }
  return `${topCount} converge on §${topId}§ · ${dissentCount} dissent${dissentCount === 1 ? "" : "s"}`;
}

function renderConsensusLine(line: string) {
  const parts: React.ReactNode[] = [];
  const segments = line.split(/§([A-G])§/g);
  let cursor = 0;
  segments.forEach((segment, index) => {
    cursor += segment.length;
    const stableKey = `seg-${cursor}-${segment}`;
    if (index % 2 === 1) {
      parts.push(<strong key={stableKey}>{segment}</strong>);
    } else if (segment.length > 0) {
      parts.push(<span key={stableKey}>{segment}</span>);
    }
  });
  return parts;
}

export function CouncilTrack(props: {
  members: ReadonlyArray<InspectorSnapshotMember>;
  artifacts: ReadonlyArray<InspectorArtifact>;
  onCellSelect?: (memberPosition: MemberPosition) => void;
}) {
  const phase2ByPosition = new Map<number, InspectorArtifact>();
  for (const artifact of props.artifacts) {
    if (artifact.phase === 2) {
      phase2ByPosition.set(artifact.memberPosition, artifact);
    }
  }

  const reviewerVotes: CandidateId[] = [];
  const cells: CellState[] = [];
  for (const memberSnapshot of props.members) {
    const position = memberSnapshot.memberPosition;
    if (!isMemberPosition(position)) continue;
    const alias = aliasFor(position);
    const modelName = memberSnapshot.model.modelId;

    if (isReviewerMemberPosition(position)) {
      const artifact = phase2ByPosition.get(position) ?? null;
      const result = reviewerVote(artifact);
      if (result.top) {
        reviewerVotes.push(result.top);
      }
      const selfAlias = selfAliasOf(position);
      const dissent =
        result.top !== null &&
        // a reviewer's top vote being any non-converging answer is treated as default;
        // we mark the cell as dissent only after we know the mode in a second pass.
        false;
      cells.push({
        position,
        alias,
        modelName,
        vote: artifact ? (result.top ? `votes §${result.top}§` : "—") : "deliberating",
        voteAccent: artifact ? "default" : "vacant",
      });
      // self-reference suppresses the "votes self" outcome since reviewers cannot rank themselves.
      void selfAlias;
      void dissent;
    } else {
      cells.push({
        position,
        alias,
        modelName,
        vote: "synthesizes",
        voteAccent: "synth",
      });
    }
  }

  const { topId } = modeOf(reviewerVotes);
  for (const cell of cells) {
    if (cell.voteAccent === "default" && topId) {
      const cellTop = cell.vote.match(/§([A-G])§/)?.[1] as CandidateId | undefined;
      if (cellTop && cellTop !== topId) {
        cell.voteAccent = "dissent";
      }
    }
  }

  return (
    <section className="track" aria-label="The council">
      <header className="track-head">
        <h2 className="track-caption">The council</h2>
        <p className="track-consensus">{renderConsensusLine(consensusLine(reviewerVotes))}</p>
      </header>
      <ol className="track-grid">
        {cells.map((cell) => {
          const isClickable = Boolean(props.onCellSelect);
          const cellNode = (
            <>
              <Sigil position={cell.position} className="cell-sigil" />
              <span className="cell-id">{cell.alias}</span>
              <span className="cell-model" title={cell.modelName}>
                {cell.modelName}
              </span>
              <span className="cell-vote">
                {cell.vote.split(/§([A-G])§/g).map((segment, idx) => {
                  const stableKey = `vote-${cell.position}-${segment}-${segment.length === 0 ? `s${idx}` : "v"}`;
                  return idx % 2 === 1 ? (
                    <em key={stableKey}>{segment}</em>
                  ) : (
                    <span key={stableKey}>{segment}</span>
                  );
                })}
              </span>
            </>
          );

          const className = cn(
            "panel cell",
            cell.voteAccent === "synth" && "cell-synth",
            cell.voteAccent === "dissent" && "cell-dissent",
            cell.voteAccent === "vacant" && "cell-vacant",
            isClickable && "cell-button",
          );

          if (isClickable) {
            return (
              <li key={cell.position}>
                <button
                  type="button"
                  className={className}
                  id={`cand-${cell.alias}`}
                  onClick={() => props.onCellSelect?.(cell.position)}
                >
                  {cellNode}
                </button>
              </li>
            );
          }

          return (
            <li key={cell.position} className={className} id={`cand-${cell.alias}`}>
              {cellNode}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
