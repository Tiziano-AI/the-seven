import { jsonApiCacheControl } from "@the-seven/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";
import { submitSession, waitForSession } from "./batchHttp";
import {
  commonsRef,
  errorEnvelope,
  finalAnswerArtifact,
  installFetch,
  internalErrorEnvelope,
  jsonResponse,
  sessionPayload,
  successEnvelope,
  undeclaredUpstreamErrorEnvelope,
} from "./batchHttp.testSupport";

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
      exportFormat: "none",
      intervalMs: 0,
      timeoutMs: 1_000,
    });

    expect(result).toEqual({
      ok: true,
      status: "completed",
      failureKind: null,
      terminalError: null,
      finalAnswer: finalAnswerArtifact(),
      export: null,
    });
    expect(calls[0]?.url).toBe("http://127.0.0.1:43217/api/v1/sessions/33");
    expect(calls[0]?.init.method).toBe("GET");
  });

  test("returns requested exports after a completed wait", async () => {
    const calls = installFetch([
      jsonResponse(successEnvelope("sessions.get", sessionPayload("completed")), 200),
      jsonResponse(
        successEnvelope("sessions.export", {
          markdown: "# Run 33\n\nFinal answer from the council.",
          json: '{"id":33}',
        }),
        200,
      ),
    ]);

    const result = await waitForSession({
      baseUrl: "http://127.0.0.1:43217",
      apiKey: "sk-or-test-key",
      ingressVersion: null,
      sessionId: 33,
      exportFormat: "markdown",
      intervalMs: 0,
      timeoutMs: 1_000,
    });

    expect(result).toMatchObject({
      ok: true,
      status: "completed",
      export: {
        markdown: "# Run 33\n\nFinal answer from the council.",
        json: null,
      },
    });
    expect(calls[1]?.url).toBe("http://127.0.0.1:43217/api/v1/sessions/export");
    expect(calls[1]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({ sessionIds: [33] });
  });

  test("rejects completed waits without exactly one phase-three synthesis", async () => {
    installFetch([
      jsonResponse(successEnvelope("sessions.get", sessionPayload("completed", [])), 200),
    ]);

    const result = await waitForSession({
      baseUrl: "http://127.0.0.1:43217",
      apiKey: "sk-or-test-key",
      ingressVersion: null,
      sessionId: 33,
      exportFormat: "none",
      intervalMs: 0,
      timeoutMs: 1_000,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "missing_final_answer",
        message: "Completed session did not expose exactly one phase-3 synthesis artifact",
        status: 200,
        traceId: null,
      },
    });
  });

  test("includes terminal errors for failed waits", async () => {
    installFetch([jsonResponse(successEnvelope("sessions.get", sessionPayload("failed")), 200)]);

    const result = await waitForSession({
      baseUrl: "http://127.0.0.1:43217",
      apiKey: "sk-or-test-key",
      ingressVersion: null,
      sessionId: 33,
      exportFormat: "none",
      intervalMs: 0,
      timeoutMs: 1_000,
    });

    expect(result).toEqual({
      ok: true,
      status: "failed",
      failureKind: "provider_error",
      terminalError: "provider failed",
      finalAnswer: null,
      export: null,
    });
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
      exportFormat: "none",
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
