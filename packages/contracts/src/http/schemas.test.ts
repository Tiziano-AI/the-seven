import { describe, expect, test } from "vitest";
import { sessionDetailPayloadSchema, sessionDiagnosticsPayloadSchema } from "./schemas";

const session = {
  id: 1,
  query: "What should the council decide?",
  questionHash: "hash",
  ingressSource: "web",
  ingressVersion: null,
  councilNameAtRun: "The Commons Council",
  status: "completed",
  failureKind: null,
  createdAt: "2026-05-14T01:25:29.823Z",
  updatedAt: "2026-05-14T01:25:30.363Z",
  totalTokens: 0,
  totalCostUsdMicros: 0,
  totalCostIsPartial: false,
  totalCost: "0.000000",
  snapshot: {
    version: 1,
    createdAt: "2026-05-14T01:25:29.782Z",
    query: "What should the council decide?",
    userMessage: "What should the council decide?",
    attachments: [],
    outputFormats: {
      phase1: "phase1",
      phase2: "phase2",
      phase3: "phase3",
    },
    council: {
      nameAtRun: "The Commons Council",
      phasePrompts: {
        phase1: "prompt1",
        phase2: "prompt2",
        phase3: "prompt3",
      },
      members: [1, 2, 3, 4, 5, 6, 7].map((memberPosition) => ({
        memberPosition,
        model: { provider: "openrouter", modelId: `model-${memberPosition}` },
        tuning: null,
      })),
    },
  },
} as const;

describe("HTTP payload schemas", () => {
  test("exposes terminalError only for failed sessions", () => {
    const completedDetail = {
      session,
      artifacts: [],
      providerCalls: [],
      terminalError: "stale internal job error",
    };
    const failedDetail = {
      ...completedDetail,
      session: {
        ...session,
        status: "failed",
        failureKind: "phase2_inference_failed",
      },
    };

    expect(() => sessionDetailPayloadSchema.parse(completedDetail)).toThrow(
      "terminalError is only exposed for failed sessions",
    );
    expect(sessionDetailPayloadSchema.parse(failedDetail).terminalError).toBe(
      "stale internal job error",
    );
    expect(() =>
      sessionDiagnosticsPayloadSchema.parse({
        session,
        providerCalls: [],
        terminalError: "stale internal job error",
      }),
    ).toThrow("terminalError is only exposed for failed sessions");
  });
});
