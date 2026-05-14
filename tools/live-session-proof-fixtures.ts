import {
  type CouncilMembers,
  type MemberPosition,
  parseCouncilMembers,
} from "@the-seven/contracts";

const REVIEWER_POSITIONS = [1, 2, 3, 4, 5, 6] as const;
const MEMBER_POSITIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export type ProofProviderCall = Readonly<{
  phase: number;
  memberPosition: MemberPosition;
  requestModelId: string;
  requestMaxOutputTokens: number | null;
  catalogRefreshedAt: string | null;
  supportedParameters: string[];
  sentParameters: string[];
  sentReasoningEffort: string | null;
  sentProviderRequireParameters: boolean;
  sentProviderIgnoredProviders: string[];
  deniedParameters: string[];
  responseId: string | null;
  responseModel: string | null;
  errorMessage: string | null;
  choiceErrorMessage: string | null;
  billingLookupStatus: string;
}>;

export type ProofArtifact = Readonly<{
  phase: number;
  artifactKind: "response" | "review" | "synthesis";
  memberPosition: MemberPosition;
  modelId: string;
  content: string;
}>;

export function review(candidateId: string, score: number) {
  return {
    score,
    strengths: [`Candidate ${candidateId} keeps concrete evidence.`],
    weaknesses: [`Candidate ${candidateId} leaves one caveat unresolved.`],
    critical_errors: [],
    missing_evidence: [],
    verdict_input: `Candidate ${candidateId} should inform the final verdict.`,
  };
}

export function canonicalReviewContent(memberPosition: number) {
  return `${JSON.stringify(
    {
      ranking: ["F", "E", "D", "C", "B", "A"],
      reviews: {
        A: review("A", 10 + memberPosition),
        B: review("B", 20 + memberPosition),
        C: review("C", 30 + memberPosition),
        D: review("D", 40 + memberPosition),
        E: review("E", 50 + memberPosition),
        F: review("F", 60 + memberPosition),
      },
      best_final_answer_inputs: ["Use the highest-scoring factual material."],
      major_disagreements: [],
    },
    null,
    2,
  )}\n`;
}

export function completeMembers(): CouncilMembers {
  return parseCouncilMembers(
    MEMBER_POSITIONS.map((memberPosition) => ({
      memberPosition,
      model: { provider: "openrouter", modelId: `provider/model-${memberPosition}` },
      tuning: {
        temperature: null,
        topP: null,
        seed: null,
        verbosity: null,
        reasoningEffort: "low",
        includeReasoning: null,
      },
    })),
  );
}

export function completeArtifacts(): ProofArtifact[] {
  return [
    ...REVIEWER_POSITIONS.map((memberPosition) => ({
      phase: 1,
      artifactKind: "response" as const,
      memberPosition,
      modelId: `provider/model-${memberPosition}`,
      content: `Candidate ${memberPosition} gives a nonblank answer.`,
    })),
    ...REVIEWER_POSITIONS.map((memberPosition) => ({
      phase: 2,
      artifactKind: "review" as const,
      memberPosition,
      modelId: `provider/model-${memberPosition}`,
      content: canonicalReviewContent(memberPosition),
    })),
    {
      phase: 3,
      artifactKind: "synthesis" as const,
      memberPosition: 7,
      modelId: "provider/model-7",
      content: "Final answer with candidate citations.",
    },
  ];
}

export function completeProviderCalls(): ProofProviderCall[] {
  const phaseOne: ProofProviderCall[] = REVIEWER_POSITIONS.map((memberPosition) => ({
    phase: 1,
    memberPosition,
    requestModelId: `provider/model-${memberPosition}`,
    requestMaxOutputTokens: 8192,
    catalogRefreshedAt: "2026-05-13T10:00:00.000Z",
    supportedParameters: ["max_tokens", "reasoning"],
    sentParameters: ["max_tokens", "reasoning"],
    sentReasoningEffort: "low",
    sentProviderRequireParameters: true,
    sentProviderIgnoredProviders: ["amazon-bedrock", "azure"],
    deniedParameters: [],
    responseId: `generation-phase-1-${memberPosition}`,
    responseModel: `provider/model-${memberPosition}`,
    errorMessage: null,
    choiceErrorMessage: null,
    billingLookupStatus: "succeeded",
  }));
  const phaseTwo: ProofProviderCall[] = REVIEWER_POSITIONS.map((memberPosition) => ({
    phase: 2,
    memberPosition,
    requestModelId: `provider/model-${memberPosition}`,
    requestMaxOutputTokens: 16_384,
    catalogRefreshedAt: "2026-05-13T10:00:00.000Z",
    supportedParameters: ["max_tokens", "reasoning", "response_format", "structured_outputs"],
    sentParameters: ["max_tokens", "response_format", "reasoning"],
    sentReasoningEffort: "low",
    sentProviderRequireParameters: true,
    sentProviderIgnoredProviders: ["amazon-bedrock", "azure"],
    deniedParameters: [],
    responseId: `generation-phase-2-${memberPosition}`,
    responseModel: `provider/model-${memberPosition}`,
    errorMessage: null,
    choiceErrorMessage: null,
    billingLookupStatus: "succeeded",
  }));
  const phaseThree: ProofProviderCall[] = [
    {
      phase: 3,
      memberPosition: 7,
      requestModelId: "provider/model-7",
      requestMaxOutputTokens: 16_384,
      catalogRefreshedAt: "2026-05-13T10:00:00.000Z",
      supportedParameters: ["max_tokens", "reasoning"],
      sentParameters: ["max_tokens", "reasoning"],
      sentReasoningEffort: "low",
      sentProviderRequireParameters: true,
      sentProviderIgnoredProviders: ["amazon-bedrock", "azure"],
      deniedParameters: [],
      responseId: "generation-phase-3-7",
      responseModel: "provider/model-7",
      errorMessage: null,
      choiceErrorMessage: null,
      billingLookupStatus: "succeeded",
    },
  ];
  return [...phaseOne, ...phaseTwo, ...phaseThree];
}
