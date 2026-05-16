import { decodeCouncilRef, jsonApiCacheControl } from "@the-seven/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";
import { submitSession, waitForSession } from "./batchHttp";

type FetchCall = Readonly<{
  url: string;
  init: RequestInit;
}>;

const timestamp = "2026-05-12T08:00:00.000Z";

function successEnvelope(resource: string, payload: unknown) {
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

function errorEnvelope() {
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

function undeclaredUpstreamErrorEnvelope() {
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

function internalErrorEnvelope() {
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

function sessionPayload(status: "pending" | "completed" | "failed") {
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
    artifacts: [],
    providerCalls: [],
    terminalError: status === "failed" ? "provider failed" : null,
  };
}

function commonsRef() {
  const ref = decodeCouncilRef("built_in:commons");
  if (!ref) {
    throw new Error("Failed to decode built-in council ref.");
  }
  return ref;
}

function installFetch(responses: ReadonlyArray<Response>) {
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

function jsonResponse(
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

describe("batch HTTP client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("submits sessions through the registry route contract", async () => {
    const calls = installFetch([
      jsonResponse(successEnvelope("sessions.create", { sessionId: 33 }), 201),
    ]);

    const result = await submitSession({
      baseUrl: "http://127.0.0.1:43217/",
      apiKey: "sk-or-test-key",
      ingressVersion: "cli@1.0.0",
      task: {
        query: "Question?",
        councilRef: commonsRef(),
      },
    });

    expect(result).toEqual({ ok: true, sessionId: 33 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://127.0.0.1:43217/api/v1/sessions");
    expect(calls[0]?.init.method).toBe("POST");
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("authorization")).toBe("Bearer sk-or-test-key");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-seven-ingress")).toBe("cli");
    expect(headers.get("x-seven-ingress-version")).toBe("cli@1.0.0");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      query: "Question?",
      councilRef: { kind: "built_in", slug: "commons" },
    });
  });

  test("waits for completed sessions through the registry route contract", async () => {
    const calls = installFetch([
      jsonResponse(successEnvelope("sessions.get", sessionPayload("completed")), 200),
    ]);

    const result = await waitForSession({
      baseUrl: "http://127.0.0.1:43217",
      apiKey: "sk-or-test-key",
      ingressVersion: null,
      sessionId: 33,
      intervalMs: 0,
      timeoutMs: 1_000,
    });

    expect(result).toEqual({ ok: true, status: "completed", failureKind: null });
    expect(calls[0]?.url).toBe("http://127.0.0.1:43217/api/v1/sessions/33");
    expect(calls[0]?.init.method).toBe("GET");
  });

  test("maps error envelopes and resource mismatches to CLI errors", async () => {
    let calls = installFetch([jsonResponse(errorEnvelope(), 401)]);
    const denied = await submitSession({
      baseUrl: "http://127.0.0.1:43217",
      apiKey: "sk-or-test-key",
      ingressVersion: null,
      task: {
        query: "Question?",
        councilRef: commonsRef(),
      },
    });

    expect(denied).toEqual({
      ok: false,
      error: {
        kind: "unauthorized",
        message: "Missing auth",
        status: 401,
        traceId: "trace-error",
      },
    });
    expect(calls).toHaveLength(1);
    vi.unstubAllGlobals();

    calls = installFetch([jsonResponse(successEnvelope("wrong.resource", { sessionId: 33 }), 201)]);
    const mismatched = await submitSession({
      baseUrl: "http://127.0.0.1:43217",
      apiKey: "sk-or-test-key",
      ingressVersion: null,
      task: {
        query: "Question?",
        councilRef: commonsRef(),
      },
    });

    expect(mismatched).toEqual({
      ok: false,
      error: {
        kind: "invalid_response",
        message: "Invalid sessions.create response",
        status: 201,
        traceId: null,
      },
    });
    expect(calls).toHaveLength(1);
  });

  test("rejects JSON API responses without the no-store cache contract", async () => {
    installFetch([jsonResponse(successEnvelope("sessions.create", { sessionId: 33 }), 201, null)]);

    const missing = await submitSession({
      baseUrl: "http://127.0.0.1:43217",
      apiKey: "sk-or-test-key",
      ingressVersion: null,
      task: {
        query: "Question?",
        councilRef: commonsRef(),
      },
    });

    expect(missing).toEqual({
      ok: false,
      error: {
        kind: "invalid_response",
        message: "sessions.create response did not return Cache-Control: no-store",
        status: 201,
        traceId: null,
      },
    });
    vi.unstubAllGlobals();

    installFetch([jsonResponse(errorEnvelope(), 401, "public, max-age=60")]);
    const wrong = await submitSession({
      baseUrl: "http://127.0.0.1:43217",
      apiKey: "sk-or-test-key",
      ingressVersion: null,
      task: {
        query: "Question?",
        councilRef: commonsRef(),
      },
    });

    expect(wrong).toEqual({
      ok: false,
      error: {
        kind: "invalid_response",
        message: "sessions.create response did not return Cache-Control: no-store",
        status: 401,
        traceId: null,
      },
    });
  });

  test("rejects success envelopes with the wrong HTTP status", async () => {
    installFetch([jsonResponse(successEnvelope("sessions.create", { sessionId: 33 }), 200)]);

    const result = await submitSession({
      baseUrl: "http://127.0.0.1:43217",
      apiKey: "sk-or-test-key",
      ingressVersion: null,
      task: {
        query: "Question?",
        councilRef: commonsRef(),
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "invalid_response",
        message: "Invalid sessions.create status",
        status: 200,
        traceId: null,
      },
    });
  });

  test("rejects undeclared error denials for the route", async () => {
    installFetch([jsonResponse(undeclaredUpstreamErrorEnvelope(), 502)]);

    const result = await submitSession({
      baseUrl: "http://127.0.0.1:43217",
      apiKey: "sk-or-test-key",
      ingressVersion: null,
      task: {
        query: "Question?",
        councilRef: commonsRef(),
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "invalid_response",
        message: "Request failed",
        status: 502,
        traceId: null,
      },
    });
  });

  test("rejects success and error envelopes whose trace header differs", async () => {
    installFetch([
      jsonResponse(
        successEnvelope("sessions.create", { sessionId: 33 }),
        201,
        jsonApiCacheControl,
        "wrong-trace",
      ),
    ]);

    const success = await submitSession({
      baseUrl: "http://127.0.0.1:43217",
      apiKey: "sk-or-test-key",
      ingressVersion: null,
      task: {
        query: "Question?",
        councilRef: commonsRef(),
      },
    });

    expect(success).toEqual({
      ok: false,
      error: {
        kind: "invalid_response",
        message: "sessions.create trace header does not match envelope trace_id (X-Trace-Id).",
        status: 201,
        traceId: null,
      },
    });
    vi.unstubAllGlobals();

    installFetch([jsonResponse(errorEnvelope(), 401, jsonApiCacheControl, "wrong-trace")]);
    const error = await submitSession({
      baseUrl: "http://127.0.0.1:43217",
      apiKey: "sk-or-test-key",
      ingressVersion: null,
      task: {
        query: "Question?",
        councilRef: commonsRef(),
      },
    });

    expect(error).toEqual({
      ok: false,
      error: {
        kind: "invalid_response",
        message: "sessions.create trace header does not match envelope trace_id (X-Trace-Id).",
        status: 401,
        traceId: null,
      },
    });
  });

  test("maps declared internal errors to CLI errors", async () => {
    installFetch([jsonResponse(internalErrorEnvelope(), 500)]);

    const result = await submitSession({
      baseUrl: "http://127.0.0.1:43217",
      apiKey: "sk-or-test-key",
      ingressVersion: null,
      task: {
        query: "Question?",
        councilRef: commonsRef(),
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "internal_error",
        message: "Internal server error",
        status: 500,
        traceId: "trace-internal",
      },
    });
  });

  test("returns a timeout when waiting exceeds the caller budget", async () => {
    installFetch([jsonResponse(successEnvelope("sessions.get", sessionPayload("pending")), 200)]);

    const result = await waitForSession({
      baseUrl: "http://127.0.0.1:43217",
      apiKey: "sk-or-test-key",
      ingressVersion: null,
      sessionId: 33,
      intervalMs: 0,
      timeoutMs: 0,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "timeout",
        message: "Wait timeout exceeded",
        status: null,
        traceId: null,
      },
    });
  });
});
