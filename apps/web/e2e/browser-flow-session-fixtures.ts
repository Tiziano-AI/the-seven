import { DEFAULT_OUTPUT_FORMATS } from "@the-seven/config";
import type { CouncilRef } from "./browser-flow-council-fixtures";
import { timestamp } from "./browser-flow-http";
import { proofModelForPosition } from "./browser-flow-model-fixtures";

type SessionStatus = "pending" | "processing" | "completed" | "failed";
type CandidateId = "A" | "B" | "C" | "D" | "E" | "F";
type IngressSource = "web" | "cli" | "api";

export function phasePrompts() {
  return {
    phase1: "Answer precisely.",
    phase2: "Evaluate precisely.",
    phase3: "Synthesize precisely.",
  };
}

export function outputFormats() {
  return DEFAULT_OUTPUT_FORMATS;
}

export function councilMembers() {
  return [1, 2, 3, 4, 5, 6, 7].map((memberPosition) => ({
    memberPosition,
    model: {
      provider: "openrouter",
      modelId: proofModelForPosition(memberPosition).id,
    },
    tuning: null,
  }));
}

export function councilDetail(ref: CouncilRef, name: string, editable: boolean) {
  return {
    ref,
    name,
    phasePrompts: phasePrompts(),
    outputFormats: outputFormats(),
    members: councilMembers(),
    editable,
    deletable: editable,
  };
}

export function sessionSummary(input: {
  id: number;
  query: string;
  status: SessionStatus;
  councilName?: string;
  ingressSource?: IngressSource;
  totalCostUsdMicros?: number;
  totalCostIsPartial?: boolean;
}) {
  const completedCostUsdMicros = input.totalCostUsdMicros ?? 123;
  return {
    id: input.id,
    query: input.query,
    questionHash: `hash-${input.id}`,
    ingressSource: input.ingressSource ?? "web",
    ingressVersion: null,
    councilNameAtRun: input.councilName ?? "The Commons Council",
    status: input.status,
    failureKind: input.status === "failed" ? "phase2_inference_failed" : null,
    createdAt: timestamp,
    updatedAt: timestamp,
    totalTokens: input.status === "completed" ? 42 : 0,
    totalCostUsdMicros: input.status === "completed" ? completedCostUsdMicros : 0,
    totalCostIsPartial: input.totalCostIsPartial ?? false,
    totalCost:
      input.status === "completed" ? (completedCostUsdMicros / 1_000_000).toFixed(6) : "0.000000",
  };
}

export function sessionSnapshot(input: {
  query: string;
  councilName?: string;
  councilRef?: CouncilRef;
  attachments?: ReadonlyArray<Readonly<{ name: string; text: string }>>;
}) {
  return {
    version: 1,
    createdAt: timestamp,
    query: input.query,
    userMessage: input.query,
    attachments: input.attachments ?? [],
    outputFormats: outputFormats(),
    council: {
      nameAtRun: input.councilName ?? "The Commons Council",
      refAtRun: input.councilRef ?? { kind: "built_in", slug: "commons" },
      phasePrompts: phasePrompts(),
      members: councilMembers(),
    },
  };
}

function phaseTwoEvaluation(top: CandidateId) {
  const candidates = ["A", "B", "C", "D", "E", "F"] as const;
  const ranking = [top, ...candidates.filter((candidate) => candidate !== top)];
  const reviews = Object.fromEntries(
    candidates.map((candidate) => [
      candidate,
      {
        score: candidate === top ? 100 : 80 - candidates.indexOf(candidate),
        strengths: [`Candidate ${candidate} has material strengths for review.`],
        weaknesses: [`Candidate ${candidate} has material weaknesses for review.`],
        critical_errors:
          candidate === top ? [] : [`Candidate ${candidate} misses a key contradiction.`],
        missing_evidence:
          candidate === top ? [] : [`Candidate ${candidate} needs stronger source support.`],
        verdict_input: `Candidate ${candidate} supplies material verdict evidence.`,
      },
    ]),
  );
  return JSON.stringify({
    ranking,
    reviews,
    best_final_answer_inputs: ["Use the strongest material evidence in the final answer."],
    major_disagreements: ["Reviewers disagreed on the weight of the source evidence."],
  });
}

function artifactFor(input: {
  sessionId: number;
  id: number;
  phase: 1 | 2 | 3;
  memberPosition: number;
  content: string;
}) {
  const role = input.memberPosition === 7 ? "synthesizer" : "reviewer";
  const alias = String.fromCharCode(64 + input.memberPosition);
  return {
    id: input.id,
    sessionId: input.sessionId,
    phase: input.phase,
    artifactKind: input.phase === 3 ? "synthesis" : input.phase === 2 ? "review" : "response",
    memberPosition: input.memberPosition,
    member: {
      position: input.memberPosition,
      role,
      alias,
      label: role === "synthesizer" ? "Synthesizer G" : `Reviewer ${alias}`,
    },
    modelId: proofModelForPosition(input.memberPosition).id,
    modelName: proofModelForPosition(input.memberPosition).name,
    content: input.content,
    tokensUsed: 42,
    costUsdMicros: 123,
    createdAt: timestamp,
  };
}

function artifactsForVotes(input: {
  sessionId: number;
  votes: readonly CandidateId[];
  includeSynthesis: boolean;
}) {
  const drafts = [1, 2, 3, 4, 5, 6].map((position) =>
    artifactFor({
      sessionId: input.sessionId,
      id: input.sessionId * 100 + position,
      phase: 1,
      memberPosition: position,
      content: `Draft memorandum from reviewer ${position}.`,
    }),
  );
  const reviews = input.votes.map((vote, index) =>
    artifactFor({
      sessionId: input.sessionId,
      id: input.sessionId * 100 + 10 + index,
      phase: 2,
      memberPosition: index + 1,
      content: phaseTwoEvaluation(vote),
    }),
  );
  const synthesis = input.includeSynthesis
    ? [
        artifactFor({
          sessionId: input.sessionId,
          id: input.sessionId * 100 + 30,
          phase: 3,
          memberPosition: 7,
          content:
            "Final answer: approve the vendor plan with conditions, grounded in candidate evidence [A] and reviewer critique [R1].",
        }),
      ]
    : [];
  return [...drafts, ...reviews, ...synthesis];
}

function voteScenario(sessionId: number): readonly CandidateId[] {
  if (sessionId === 106) return ["A"];
  if (sessionId === 107) return ["A", "A", "A", "A", "B", "B"];
  if (sessionId === 108) return ["A", "B"];
  if (sessionId === 105) return [];
  return ["F", "F", "F", "F", "F", "F"];
}

export function sessionDetail(input: {
  id: number;
  query: string;
  status: SessionStatus;
  councilName?: string;
  councilRef?: CouncilRef;
  attachments?: ReadonlyArray<Readonly<{ name: string; text: string }>>;
  ingressSource?: IngressSource;
}) {
  const hasProceedings = input.status === "completed" || input.status === "processing";
  return {
    session: {
      ...sessionSummary(input),
      snapshot: sessionSnapshot(input),
    },
    artifacts: hasProceedings
      ? artifactsForVotes({
          sessionId: input.id,
          votes: voteScenario(input.id),
          includeSynthesis: input.status === "completed",
        })
      : [],
    providerCalls: [],
    terminalError:
      input.status === "failed"
        ? "OpenRouter request failed: upstream provider returned a rate-limit response."
        : null,
  };
}
