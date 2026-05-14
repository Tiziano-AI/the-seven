import { describe, expect, it } from "vitest";
import { assertLiveSessionProof, assertNoPendingBillingLookups } from "./live-session-proof";
import {
  completeArtifacts,
  completeMembers,
  completeProviderCalls,
  review,
} from "./live-session-proof-fixtures";

describe("live session proof helper", () => {
  it("accepts complete response, review, synthesis, and provider-call proof", () => {
    expect(() =>
      assertLiveSessionProof({
        artifacts: completeArtifacts(),
        providerCalls: completeProviderCalls(),
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).not.toThrow();
  });

  it("rejects snapshot rosters that do not match the selected built-in council", () => {
    const snapshotMembers = completeMembers();
    snapshotMembers[0] = {
      ...snapshotMembers[0],
      model: { provider: "openrouter", modelId: "provider/wrong-model" },
    };

    expect(() =>
      assertLiveSessionProof({
        artifacts: completeArtifacts(),
        providerCalls: completeProviderCalls(),
        snapshotMembers,
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("snapshot member 1 used provider/wrong-model; expected provider/model-1");
  });

  it("rejects artifacts recorded against the wrong model id", () => {
    const artifacts = completeArtifacts();
    artifacts[0] = { ...artifacts[0], modelId: "provider/wrong-model" };

    expect(() =>
      assertLiveSessionProof({
        artifacts,
        providerCalls: completeProviderCalls(),
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("phase-1 response artifact 1 used provider/wrong-model; expected provider/model-1");
  });

  it("rejects provider calls recorded against the wrong model id", () => {
    const calls = completeProviderCalls();
    calls[0] = { ...calls[0], requestModelId: "provider/wrong-model" };

    expect(() =>
      assertLiveSessionProof({
        artifacts: completeArtifacts(),
        providerCalls: calls,
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("phase-1 member 1 requested provider/wrong-model; expected provider/model-1");
  });

  it("rejects provider calls with the wrong sent reasoning effort", () => {
    const calls = completeProviderCalls();
    calls[0] = { ...calls[0], sentReasoningEffort: "medium" };

    expect(() =>
      assertLiveSessionProof({
        artifacts: completeArtifacts(),
        providerCalls: calls,
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("provider/model-1 sent reasoning effort medium; expected low");
  });

  it("rejects provider calls without the required OpenRouter provider routing controls", () => {
    const calls = completeProviderCalls();
    calls[0] = {
      ...calls[0],
      sentProviderRequireParameters: false,
      sentProviderIgnoredProviders: [],
    };

    expect(() =>
      assertLiveSessionProof({
        artifacts: completeArtifacts(),
        providerCalls: calls,
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("provider/model-1 did not send provider.require_parameters");
  });

  it("rejects missing phase-1 response artifacts", () => {
    const artifacts = completeArtifacts().filter(
      (artifact) => !(artifact.phase === 1 && artifact.memberPosition === 6),
    );

    expect(() =>
      assertLiveSessionProof({
        artifacts,
        providerCalls: completeProviderCalls(),
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("session 10: expected 6 phase-1 response artifacts");
  });

  it("rejects blank phase-1 response artifacts", () => {
    const artifacts = completeArtifacts();
    artifacts[0] = { ...artifacts[0], content: " " };

    expect(() =>
      assertLiveSessionProof({
        artifacts,
        providerCalls: completeProviderCalls(),
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("session 10: phase-1 response artifact 1 was blank");
  });

  it("rejects missing phase-2 review artifacts", () => {
    const artifacts = completeArtifacts().filter(
      (artifact) => !(artifact.phase === 2 && artifact.memberPosition === 6),
    );

    expect(() =>
      assertLiveSessionProof({
        artifacts,
        providerCalls: completeProviderCalls(),
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("session 10: expected 6 phase-2 review artifacts");
  });

  it("rejects a missing phase-3 synthesis artifact", () => {
    const artifacts = completeArtifacts().filter((artifact) => artifact.phase !== 3);

    expect(() =>
      assertLiveSessionProof({
        artifacts,
        providerCalls: completeProviderCalls(),
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("session 10: expected one phase-3 synthesis artifact");
  });

  it("rejects a blank phase-3 synthesis artifact", () => {
    const artifacts = completeArtifacts();
    artifacts[12] = { ...artifacts[12], content: "   " };

    expect(() =>
      assertLiveSessionProof({
        artifacts,
        providerCalls: completeProviderCalls(),
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("session 10: phase-3 synthesis artifact was blank");
  });

  it("rejects stored review artifacts whose ranking is not score-derived", () => {
    const artifacts = completeArtifacts();
    artifacts[6] = {
      ...artifacts[6],
      content: `${JSON.stringify(
        {
          ranking: ["A", "B", "C", "D", "E", "F"],
          reviews: {
            A: review("A", 10),
            B: review("B", 20),
            C: review("C", 30),
            D: review("D", 40),
            E: review("E", 50),
            F: review("F", 60),
          },
          best_final_answer_inputs: ["Use the highest-scoring factual material."],
          major_disagreements: [],
        },
        null,
        2,
      )}\n`,
    };

    expect(() =>
      assertLiveSessionProof({
        artifacts,
        providerCalls: completeProviderCalls(),
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("Phase 2 ranking must match score-derived order");
  });

  it("rejects placeholder phase-2 review artifacts", () => {
    const artifacts = completeArtifacts();
    const placeholderReview = {
      score: 50,
      strengths: ["AAAAAAAAAAAA"],
      weaknesses: ["111111111111"],
      critical_errors: [],
      missing_evidence: [],
      verdict_input: "... ... ... ...",
    };
    artifacts[6] = {
      ...artifacts[6],
      content: `${JSON.stringify(
        {
          ranking: ["A", "B", "C", "D", "E", "F"],
          reviews: {
            A: placeholderReview,
            B: placeholderReview,
            C: placeholderReview,
            D: placeholderReview,
            E: placeholderReview,
            F: placeholderReview,
          },
          best_final_answer_inputs: ["same same same"],
          major_disagreements: [],
        },
        null,
        2,
      )}\n`,
    };

    expect(() =>
      assertLiveSessionProof({
        artifacts,
        providerCalls: completeProviderCalls(),
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("Phase 2 text must contain material prose");
  });

  it("rejects provider calls that did not send structured output", () => {
    const calls = completeProviderCalls();
    calls[8] = { ...calls[8], sentParameters: ["max_tokens", "reasoning"] };

    expect(() =>
      assertLiveSessionProof({
        artifacts: completeArtifacts(),
        providerCalls: calls,
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("provider/model-3 did not send response_format in phase 2");
  });

  it("rejects phase-2 provider calls without structured-output catalog support", () => {
    const calls = completeProviderCalls();
    calls[8] = {
      ...calls[8],
      supportedParameters: ["max_tokens", "reasoning", "response_format"],
    };

    expect(() =>
      assertLiveSessionProof({
        artifacts: completeArtifacts(),
        providerCalls: calls,
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("provider/model-3 catalog did not support structured_outputs in phase 2");
  });

  it("rejects provider calls that did not send an output cap", () => {
    const calls = completeProviderCalls();
    calls[1] = { ...calls[1], requestMaxOutputTokens: null, sentParameters: ["reasoning"] };

    expect(() =>
      assertLiveSessionProof({
        artifacts: completeArtifacts(),
        providerCalls: calls,
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("provider/model-2 did not send max_tokens in phase 1");
  });

  it("rejects provider calls with the wrong phase output cap", () => {
    const calls = completeProviderCalls();
    calls[8] = { ...calls[8], requestMaxOutputTokens: 8192 };

    expect(() =>
      assertLiveSessionProof({
        artifacts: completeArtifacts(),
        providerCalls: calls,
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("provider/model-3 requested 8192 output tokens in phase 2; expected 16384");
  });

  it("rejects missing phase-1 provider calls", () => {
    const calls = completeProviderCalls().filter(
      (call) => !(call.phase === 1 && call.memberPosition === 6),
    );

    expect(() =>
      assertLiveSessionProof({
        artifacts: completeArtifacts(),
        providerCalls: calls,
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("session 10: expected 6 phase-1 provider calls");
  });

  it("rejects phase-1 provider errors", () => {
    const calls = completeProviderCalls();
    calls[0] = { ...calls[0], errorMessage: "provider failed" };

    expect(() =>
      assertLiveSessionProof({
        artifacts: completeArtifacts(),
        providerCalls: calls,
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("provider/model-1 recorded an error");
  });

  it("rejects missing member-7 phase-3 provider calls", () => {
    const calls = completeProviderCalls().filter((call) => call.phase !== 3);

    expect(() =>
      assertLiveSessionProof({
        artifacts: completeArtifacts(),
        providerCalls: calls,
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("session 10: expected 1 phase-3 provider calls");
  });

  it("rejects phase-3 provider calls from a non-synthesizer position", () => {
    const calls = completeProviderCalls();
    calls[12] = { ...calls[12], memberPosition: 6 };

    expect(() =>
      assertLiveSessionProof({
        artifacts: completeArtifacts(),
        providerCalls: calls,
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("Expected 7, received 6");
  });

  it("rejects denied phase-2 parameters", () => {
    const calls = completeProviderCalls();
    calls[10] = {
      ...calls[10],
      deniedParameters: ["response_format"],
    };

    expect(() =>
      assertLiveSessionProof({
        artifacts: completeArtifacts(),
        providerCalls: calls,
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("provider/model-5 had denied provider parameters");
  });

  it("rejects phase-2 choice errors", () => {
    const calls = completeProviderCalls();
    calls[10] = {
      ...calls[10],
      choiceErrorMessage: "choice parse failed",
    };

    expect(() =>
      assertLiveSessionProof({
        artifacts: completeArtifacts(),
        providerCalls: calls,
        snapshotMembers: completeMembers(),
        expectedMembers: completeMembers(),
        label: "session 10",
      }),
    ).toThrow("provider/model-5 recorded a choice error");
  });

  it("rejects pending billing lookup diagnostics", () => {
    const calls = completeProviderCalls();
    calls[6] = { ...calls[6], billingLookupStatus: "pending" };

    expect(() =>
      assertNoPendingBillingLookups({
        providerCalls: calls,
        label: "session 10",
      }),
    ).toThrow("session 10: pending billing lookup diagnostics remain for p2/m1/provider/model-1");
  });
});
