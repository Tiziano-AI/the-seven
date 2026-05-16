import {
  buildErrorEnvelope,
  buildSuccessEnvelope,
  jsonApiCacheControl,
  routeContract,
} from "@the-seven/contracts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { apiRequest } from "./apiClient";

function jsonApiHeaders(traceId: string) {
  return { "Cache-Control": jsonApiCacheControl, "X-Trace-Id": traceId } as const;
}

describe("apiRequest", () => {
  beforeEach(() => {
    process.env.SEVEN_BASE_URL = "http://127.0.0.1:43217";
  });

  afterEach(() => {
    delete process.env.SEVEN_BASE_URL;
    vi.unstubAllGlobals();
  });

  test("derives method, path, body validation, and resource validation from the route registry", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("http://127.0.0.1:43217/api/v1/sessions/42/rerun");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(
        JSON.stringify({ councilRef: { kind: "built_in", slug: "commons" } }),
      );
      return Response.json(
        buildSuccessEnvelope({
          traceId: "trace",
          now: new Date("2026-05-09T00:00:00.000Z"),
          resource: "sessions.rerun",
          payload: { sessionId: 43 },
        }),
        { headers: jsonApiHeaders("trace") },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequest({
      route: routeContract("sessions.rerun"),
      params: { sessionId: 42 },
      body: { councilRef: { kind: "built_in", slug: "commons" } },
    });

    expect(result).toEqual({ sessionId: 43 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("rejects resource mismatches in successful envelopes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          buildSuccessEnvelope({
            traceId: "trace",
            now: new Date("2026-05-09T00:00:00.000Z"),
            resource: "sessions.create",
            payload: { sessionId: 43 },
          }),
          { headers: jsonApiHeaders("trace") },
        ),
      ),
    );

    await expect(
      apiRequest({
        route: routeContract("sessions.rerun"),
        params: { sessionId: 42 },
        body: { councilRef: { kind: "built_in", slug: "commons" } },
      }),
    ).rejects.toThrow("API resource mismatch");
  });

  test("rejects success envelopes with the wrong HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          buildSuccessEnvelope({
            traceId: "trace",
            now: new Date("2026-05-09T00:00:00.000Z"),
            resource: "sessions.create",
            payload: { sessionId: 43 },
          }),
          { status: 200, headers: jsonApiHeaders("trace") },
        ),
      ),
    );

    await expect(
      apiRequest({
        route: routeContract("sessions.create"),
        body: {
          query: "Question?",
          councilRef: { kind: "built_in", slug: "commons" },
        },
      }),
    ).rejects.toThrow("API status mismatch: expected 201, received 200");
  });

  test("requires an explicit server-side base URL", async () => {
    delete process.env.SEVEN_BASE_URL;

    await expect(
      apiRequest({
        route: routeContract("sessions.rerun"),
        params: { sessionId: 42 },
        body: { councilRef: { kind: "built_in", slug: "commons" } },
      }),
    ).rejects.toThrow("SEVEN_BASE_URL is required");
  });

  test("rejects explicit bodies for no-body route contracts", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest({
        route: routeContract("demo.logout"),
        body: {},
      }),
    ).rejects.toThrow("API POST /api/v1/demo/logout does not accept a request body");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects undeclared error denials for the route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          buildErrorEnvelope({
            traceId: "trace",
            now: new Date("2026-05-09T00:00:00.000Z"),
            kind: "upstream_error",
            message: "OpenRouter request failed",
            details: { service: "openrouter" },
          }),
          { status: 502, headers: jsonApiHeaders("trace") },
        ),
      ),
    );

    await expect(
      apiRequest({
        route: routeContract("demo.logout"),
      }),
    ).rejects.toThrow("API denial mismatch");
  });

  test("accepts declared internal errors for the route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          buildErrorEnvelope({
            traceId: "trace",
            now: new Date("2026-05-09T00:00:00.000Z"),
            kind: "internal_error",
            message: "Internal server error",
            details: { errorId: "opaque-error-id" },
          }),
          { status: 500, headers: jsonApiHeaders("trace") },
        ),
      ),
    );

    await expect(
      apiRequest({
        route: routeContract("demo.logout"),
      }),
    ).rejects.toMatchObject({
      kind: "internal_error",
      status: 500,
      details: { errorId: "opaque-error-id" },
    });
  });

  test("rejects JSON API responses without no-store", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          buildSuccessEnvelope({
            traceId: "trace",
            now: new Date("2026-05-09T00:00:00.000Z"),
            resource: "sessions.rerun",
            payload: { sessionId: 43 },
          }),
        ),
      ),
    );

    await expect(
      apiRequest({
        route: routeContract("sessions.rerun"),
        params: { sessionId: 42 },
        body: { councilRef: { kind: "built_in", slug: "commons" } },
      }),
    ).rejects.toThrow("API POST /api/v1/sessions/[sessionId]/rerun did not return");
  });

  test("rejects success and error envelopes whose trace header differs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          buildSuccessEnvelope({
            traceId: "trace",
            now: new Date("2026-05-09T00:00:00.000Z"),
            resource: "sessions.rerun",
            payload: { sessionId: 43 },
          }),
          { headers: jsonApiHeaders("wrong-trace") },
        ),
      ),
    );

    await expect(
      apiRequest({
        route: routeContract("sessions.rerun"),
        params: { sessionId: 42 },
        body: { councilRef: { kind: "built_in", slug: "commons" } },
      }),
    ).rejects.toThrow("trace header does not match envelope trace_id");
    vi.unstubAllGlobals();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          buildErrorEnvelope({
            traceId: "trace",
            now: new Date("2026-05-09T00:00:00.000Z"),
            kind: "internal_error",
            message: "Internal server error",
            details: { errorId: "opaque-error-id" },
          }),
          { status: 500, headers: jsonApiHeaders("wrong-trace") },
        ),
      ),
    );

    await expect(
      apiRequest({
        route: routeContract("demo.logout"),
      }),
    ).rejects.toThrow("trace header does not match envelope trace_id");
  });
});
