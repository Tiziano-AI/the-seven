import { PROVIDER_OUTPUT_TOKEN_LIMITS } from "@the-seven/config";
import {
  type CouncilMembers,
  type CouncilMemberTuning,
  type MemberPosition,
  PHASE_TWO_CANDIDATE_IDS,
  phaseTwoEvaluationSchema,
  rankPhaseTwoCandidatesByScore,
} from "@the-seven/contracts";

type LiveArtifact = Readonly<{
  phase: number;
  artifactKind: "response" | "review" | "synthesis";
  memberPosition: MemberPosition;
  modelId: string;
  content: string;
}>;

type LiveProviderCall = Readonly<{
  phase: number;
  memberPosition: MemberPosition;
  requestModelId: string;
  requestMaxOutputTokens: number | null;
  catalogRefreshedAt: string | null;
  supportedParameters: ReadonlyArray<string>;
  sentParameters: ReadonlyArray<string>;
  sentReasoningEffort: string | null;
  sentProviderRequireParameters: boolean;
  sentProviderIgnoredProviders: ReadonlyArray<string>;
  deniedParameters: ReadonlyArray<string>;
  responseId: string | null;
  responseModel: string | null;
  errorMessage: string | null;
  choiceErrorMessage: string | null;
  billingLookupStatus: string;
}>;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertTuningEqual(input: {
  actual: CouncilMemberTuning | null;
  expected: CouncilMemberTuning | null;
  label: string;
}): void {
  assert(
    input.actual?.temperature === input.expected?.temperature &&
      input.actual?.topP === input.expected?.topP &&
      input.actual?.seed === input.expected?.seed &&
      input.actual?.verbosity === input.expected?.verbosity &&
      input.actual?.reasoningEffort === input.expected?.reasoningEffort &&
      input.actual?.includeReasoning === input.expected?.includeReasoning,
    `${input.label}: snapshot tuning does not match the selected built-in roster.`,
  );
}

function memberByPosition(members: CouncilMembers, memberPosition: MemberPosition, label: string) {
  const member = members.find((candidate) => candidate.memberPosition === memberPosition);
  assert(member !== undefined, `${label}: missing member ${memberPosition}.`);
  return member;
}

function assertSnapshotMatchesExpected(input: {
  snapshotMembers: CouncilMembers;
  expectedMembers: CouncilMembers;
  label: string;
}): void {
  for (const expected of input.expectedMembers) {
    const actual = memberByPosition(input.snapshotMembers, expected.memberPosition, input.label);
    assert(
      actual.model.modelId === expected.model.modelId,
      `${input.label}: snapshot member ${expected.memberPosition} used ${actual.model.modelId}; expected ${expected.model.modelId}.`,
    );
    assertTuningEqual({
      actual: actual.tuning,
      expected: expected.tuning,
      label: `${input.label}: member ${expected.memberPosition}`,
    });
  }
}

function assertExactCandidateKeys(reviews: Record<string, unknown>): void {
  expectArraysEqual(Object.keys(reviews).sort(), [...PHASE_TWO_CANDIDATE_IDS].sort());
}

function expectArraysEqual(left: ReadonlyArray<string>, right: ReadonlyArray<string>): void {
  assert(
    left.length === right.length && left.every((value, index) => value === right[index]),
    `Expected ${right.join(",")}, received ${left.join(",")}`,
  );
}

function expectedPhaseOutputCap(phase: number): number {
  if (phase === 1) return PROVIDER_OUTPUT_TOKEN_LIMITS.phase1;
  if (phase === 2) return PROVIDER_OUTPUT_TOKEN_LIMITS.phase2;
  if (phase === 3) return PROVIDER_OUTPUT_TOKEN_LIMITS.phase3;
  throw new Error(`Unexpected provider-call phase ${phase}.`);
}

function assertSuccessfulProviderCap(call: LiveProviderCall, label: string): void {
  assert(
    call.sentParameters.includes("max_tokens"),
    `${label}: ${call.requestModelId} did not send max_tokens in phase ${call.phase}.`,
  );
  assert(
    call.requestMaxOutputTokens === expectedPhaseOutputCap(call.phase),
    `${label}: ${call.requestModelId} requested ${call.requestMaxOutputTokens ?? "null"} output tokens in phase ${call.phase}; expected ${expectedPhaseOutputCap(call.phase)}.`,
  );
}

function assertExpectedArtifactPositions(input: {
  artifacts: ReadonlyArray<LiveArtifact>;
  phase: number;
  artifactKind: "response" | "review";
  expectedPositions: ReadonlyArray<string>;
  expectedMembers: CouncilMembers;
  label: string;
}): ReadonlyArray<LiveArtifact> {
  const artifacts = input.artifacts
    .filter(
      (artifact) => artifact.phase === input.phase && artifact.artifactKind === input.artifactKind,
    )
    .sort((left, right) => left.memberPosition - right.memberPosition);
  assert(
    artifacts.length === input.expectedPositions.length,
    `${input.label}: expected ${input.expectedPositions.length} phase-${input.phase} ${input.artifactKind} artifacts.`,
  );
  expectArraysEqual(
    artifacts.map((artifact) => String(artifact.memberPosition)),
    input.expectedPositions,
  );
  for (const artifact of artifacts) {
    const expected = memberByPosition(input.expectedMembers, artifact.memberPosition, input.label);
    assert(
      artifact.modelId === expected.model.modelId,
      `${input.label}: phase-${input.phase} ${input.artifactKind} artifact ${artifact.memberPosition} used ${artifact.modelId}; expected ${expected.model.modelId}.`,
    );
    assert(
      artifact.content.trim().length > 0,
      `${input.label}: phase-${input.phase} ${input.artifactKind} artifact ${artifact.memberPosition} was blank.`,
    );
  }
  return artifacts;
}

function successfulProviderCalls(input: {
  providerCalls: ReadonlyArray<LiveProviderCall>;
  phase: number;
  expectedPositions: ReadonlyArray<string>;
  expectedMembers: CouncilMembers;
  label: string;
}) {
  const calls = input.providerCalls
    .filter((call) => call.phase === input.phase)
    .sort((left, right) => left.memberPosition - right.memberPosition);
  assert(
    calls.length === input.expectedPositions.length,
    `${input.label}: expected ${input.expectedPositions.length} phase-${input.phase} provider calls.`,
  );
  expectArraysEqual(
    calls.map((call) => String(call.memberPosition)),
    input.expectedPositions,
  );

  for (const call of calls) {
    const expected = memberByPosition(input.expectedMembers, call.memberPosition, input.label);
    assert(
      call.requestModelId === expected.model.modelId,
      `${input.label}: phase-${input.phase} member ${call.memberPosition} requested ${call.requestModelId}; expected ${expected.model.modelId}.`,
    );
    assert(
      call.catalogRefreshedAt !== null,
      `${input.label}: ${call.requestModelId} missing catalog freshness.`,
    );
    assert(
      call.supportedParameters.includes("reasoning"),
      `${input.label}: ${call.requestModelId} catalog did not support reasoning.`,
    );
    assert(
      call.supportedParameters.includes("max_tokens"),
      `${input.label}: ${call.requestModelId} catalog did not support max_tokens.`,
    );
    assert(
      call.sentParameters.includes("reasoning"),
      `${input.label}: ${call.requestModelId} did not send tier reasoning effort.`,
    );
    assert(
      call.sentReasoningEffort === expected.tuning?.reasoningEffort,
      `${input.label}: ${call.requestModelId} sent reasoning effort ${call.sentReasoningEffort ?? "null"}; expected ${expected.tuning?.reasoningEffort ?? "null"}.`,
    );
    assert(
      call.deniedParameters.length === 0,
      `${input.label}: ${call.requestModelId} had denied provider parameters.`,
    );
    assert(
      call.sentProviderRequireParameters,
      `${input.label}: ${call.requestModelId} did not send provider.require_parameters.`,
    );
    assert(
      call.sentProviderIgnoredProviders.includes("amazon-bedrock") &&
        call.sentProviderIgnoredProviders.includes("azure"),
      `${input.label}: ${call.requestModelId} did not send the OpenRouter provider ignore list.`,
    );
    assert(call.responseId !== null, `${input.label}: ${call.requestModelId} missing response id.`);
    assert(
      call.responseModel !== null,
      `${input.label}: ${call.requestModelId} missing response model.`,
    );
    assert(call.errorMessage === null, `${input.label}: ${call.requestModelId} recorded an error.`);
    assert(
      call.choiceErrorMessage === null,
      `${input.label}: ${call.requestModelId} recorded a choice error.`,
    );
    assertSuccessfulProviderCap(call, input.label);
  }

  return calls;
}

/**
 * Proves live diagnostics no longer contain restart-owned billing lookups that
 * are still pending after bounded backfill or startup recovery has had a chance
 * to terminalize them.
 */
export function assertNoPendingBillingLookups(input: {
  providerCalls: ReadonlyArray<LiveProviderCall>;
  label: string;
}): void {
  const pendingCalls = input.providerCalls.filter((call) => call.billingLookupStatus === "pending");
  assert(
    pendingCalls.length === 0,
    `${input.label}: pending billing lookup diagnostics remain for ${pendingCalls
      .map((call) => `p${call.phase}/m${call.memberPosition}/${call.requestModelId}`)
      .join(", ")}`,
  );
}

/**
 * Proves a live completed session reached the surviving phase-2 contract:
 * six stored canonical review artifacts, one nonblank phase-3 synthesis
 * artifact, successful provider calls in every phase with exact server-owned
 * output caps, and six phase-2 provider calls with structured output and no
 * denied provider parameters.
 */
export function assertLiveSessionProof(input: {
  artifacts: ReadonlyArray<LiveArtifact>;
  providerCalls: ReadonlyArray<LiveProviderCall>;
  snapshotMembers: CouncilMembers;
  expectedMembers: CouncilMembers;
  label: string;
}): void {
  assertSnapshotMatchesExpected({
    snapshotMembers: input.snapshotMembers,
    expectedMembers: input.expectedMembers,
    label: input.label,
  });
  assertExpectedArtifactPositions({
    artifacts: input.artifacts,
    phase: 1,
    artifactKind: "response",
    expectedPositions: ["1", "2", "3", "4", "5", "6"],
    expectedMembers: input.expectedMembers,
    label: input.label,
  });
  const reviewArtifacts = assertExpectedArtifactPositions({
    artifacts: input.artifacts,
    phase: 2,
    artifactKind: "review",
    expectedPositions: ["1", "2", "3", "4", "5", "6"],
    expectedMembers: input.expectedMembers,
    label: input.label,
  });

  const synthesisArtifacts = input.artifacts.filter(
    (artifact) =>
      artifact.phase === 3 &&
      artifact.artifactKind === "synthesis" &&
      artifact.memberPosition === 7,
  );
  assert(
    synthesisArtifacts.length === 1,
    `${input.label}: expected one phase-3 synthesis artifact.`,
  );
  assert(
    synthesisArtifacts[0]?.modelId ===
      memberByPosition(input.expectedMembers, 7, input.label).model.modelId,
    `${input.label}: phase-3 synthesis artifact used ${synthesisArtifacts[0]?.modelId ?? "missing"}; expected ${memberByPosition(input.expectedMembers, 7, input.label).model.modelId}.`,
  );
  assert(
    synthesisArtifacts[0]?.content.trim().length > 0,
    `${input.label}: phase-3 synthesis artifact was blank.`,
  );

  successfulProviderCalls({
    providerCalls: input.providerCalls,
    phase: 1,
    expectedPositions: ["1", "2", "3", "4", "5", "6"],
    expectedMembers: input.expectedMembers,
    label: input.label,
  });

  for (const artifact of reviewArtifacts) {
    const parsed = phaseTwoEvaluationSchema.parse(JSON.parse(artifact.content) as unknown);
    expectArraysEqual(parsed.ranking, rankPhaseTwoCandidatesByScore(parsed.reviews));
    assertExactCandidateKeys(parsed.reviews);
  }

  const phaseTwoCalls = successfulProviderCalls({
    providerCalls: input.providerCalls,
    phase: 2,
    expectedPositions: ["1", "2", "3", "4", "5", "6"],
    expectedMembers: input.expectedMembers,
    label: input.label,
  });

  for (const call of phaseTwoCalls) {
    assert(
      call.supportedParameters.includes("response_format"),
      `${input.label}: ${call.requestModelId} catalog did not support response_format in phase 2.`,
    );
    assert(
      call.supportedParameters.includes("structured_outputs"),
      `${input.label}: ${call.requestModelId} catalog did not support structured_outputs in phase 2.`,
    );
    assert(
      call.sentParameters.includes("response_format"),
      `${input.label}: ${call.requestModelId} did not send response_format in phase 2.`,
    );
  }

  successfulProviderCalls({
    providerCalls: input.providerCalls,
    phase: 3,
    expectedPositions: ["7"],
    expectedMembers: input.expectedMembers,
    label: input.label,
  });
}
