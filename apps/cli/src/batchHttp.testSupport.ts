import { decodeCouncilRef, jsonApiCacheControl } from "@the-seven/contracts";
import { vi } from "vitest";

export type FetchCall = Readonly<{
  url: string;
  init: RequestInit;
}>;

export const timestamp = "2026-05-12T08:00:00.000Z";

export function successEnvelope(resource: string, payload: unknown) {
  return {
    schema_version: 1,
    trace_id: "trace-success",
    ts: timestamp,
    result: {
      resource,
      payload,
    },
  };
}

export function errorEnvelope() {
  return {
    schema_version: 1,
    trace_id: "trace-error",
    ts: timestamp,
    kind: "unauthorized",
    message: "Missing auth",
    details: {
      reason: "missing_auth",
    },
  };
}

export function undeclaredUpstreamErrorEnvelope() {
  return {
    schema_version: 1,
    trace_id: "trace-error",
    ts: timestamp,
    kind: "upstream_error",
    message: "Resend request failed",
    details: {
      service: "resend",
    },
  };
}

export function internalErrorEnvelope() {
  return {
    schema_version: 1,
    trace_id: "trace-internal",
    ts: timestamp,
    kind: "internal_error",
    message: "Internal server error",
    details: {
      errorId: "opaque-error-id",
    },
  };
}

export function finalAnswerArtifact() {
  return {
    id: 777,
    sessionId: 33,
    phase: 3,
    artifactKind: "synthesis",
    memberPosition: 7,
    member: {
      position: 7,
      role: "synthesizer",
      alias: "Seventh",
      label: "The Seventh",
    },
    modelId: "provider/model-7",
    modelName: "Model 7",
    content: "Final answer from the council.",
    tokensUsed: 123,
    costUsdMicros: 456,
    createdAt: timestamp,
  };
}

export function sessionPayload(
  status: "pending" | "completed" | "failed",
  artifacts: ReadonlyArray<unknown> = status === "completed" ? [finalAnswerArtifact()] : [],
) {
  return {
    session: {
      id: 33,
      query: "Question?",
      questionHash: "hash",
      ingressSource: "cli",
      ingressVersion: "cli@1.0.0",
      councilNameAtRun: "Commons",
      status,
      failureKind: status === "failed" ? "provider_error" : null,
      createdAt: timestamp,
      updatedAt: timestamp,
      totalTokens: 0,
      totalCostUsdMicros: 0,
      totalCostIsPartial: false,
      totalCost: "$0.000000",
      snapshot: {
        version: 1,
        createdAt: timestamp,
        query: "Question?",
        userMessage: "Question?",
        attachments: [],
        outputFormats: {
          phase1: "Answer clearly.",
          phase2: "Evaluate clearly.",
          phase3: "Synthesize clearly.",
        },
        council: {
          nameAtRun: "Commons",
          phasePrompts: {
            phase1: "Answer clearly.",
            phase2: "Evaluate clearly.",
            phase3: "Synthesize clearly.",
          },
          members: [1, 2, 3, 4, 5, 6, 7].map((memberPosition) => ({
            memberPosition,
            model: {
              provider: "openrouter",
              modelId: `provider/model-${memberPosition}`,
            },
            tuning: null,
          })),
        },
      },
    },
    artifacts,
    providerCalls: [],
    terminalError: status === "failed" ? "provider failed" : null,
  };
}

export function commonsRef() {
  const ref = decodeCouncilRef("built_in:commons");
  if (!ref) {
    throw new Error("Failed to decode built-in council ref.");
  }
  return ref;
}

export function installFetch(responses: ReadonlyArray<Response>) {
  const calls: FetchCall[] = [];
  const queue = [...responses];
  vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      init: init ?? {},
    });
    const response = queue.shift();
    if (!response) {
      throw new Error("Unexpected fetch call.");
    }
    return response;
  });
  return calls;
}

export function jsonResponse(
  payload: unknown,
  status: number,
  cacheControl: string | null = jsonApiCacheControl,
  traceHeader?: string,
) {
  const headers = new Headers();
  if (cacheControl !== null) {
    headers.set("Cache-Control", cacheControl);
  }
  if (traceHeader !== undefined) {
    headers.set("X-Trace-Id", traceHeader);
  } else if (
    payload &&
    typeof payload === "object" &&
    "trace_id" in payload &&
    typeof payload.trace_id === "string"
  ) {
    headers.set("X-Trace-Id", payload.trace_id);
  }
  return new Response(JSON.stringify(payload), { headers, status });
}
