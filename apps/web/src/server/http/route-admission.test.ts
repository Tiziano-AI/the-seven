import { routeContract } from "@the-seven/contracts";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  resolveAuthContext: vi.fn(),
}));
const limiterMocks = vi.hoisted(() => ({
  admitIngressFloodLimit: vi.fn(),
}));
const configMocks = vi.hoisted(() => ({
  serverRuntime: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./auth", () => ({
  resolveAuthContext: authMocks.resolveAuthContext,
}));
vi.mock("../services/ingressLimits", () => limiterMocks);
vi.mock("@the-seven/config", () => ({
  MAX_REQUEST_BODY_BYTES: 512_000,
  serverRuntime: configMocks.serverRuntime,
}));

import { handleRoute } from "./route";

function request(input: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}) {
  return new NextRequest(
    new Request(input.url ?? "http://localhost/api/v1/sessions", {
      method: input.method ?? "GET",
      headers: input.headers,
      body: input.body,
    }),
  );
}

async function readJson(response: Response) {
  return (await response.json()) as {
    trace_id: string;
    kind?: string;
    details?: unknown;
    result?: { resource: string };
  };
}

function mockDemoAuth() {
  authMocks.resolveAuthContext.mockResolvedValue({
    kind: "demo",
    demoSessionId: 11,
    userId: 1,
    principal: "demo@example.com",
    openRouterKey: "demo-key",
    expiresAt: 1_800_000_000_000,
  });
}

describe("handleRoute admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limiterMocks.admitIngressFloodLimit.mockResolvedValue(null);
    configMocks.serverRuntime.mockReturnValue({
      nodeEnv: "production",
      publicOrigin: "http://localhost",
    });
  });

  test("invalid ingress denies before auth and ignores client trace", async () => {
    const response = await handleRoute(
      request({ headers: { "x-seven-ingress": "desktop", "x-trace-id": "client-trace" } }),
      {
        route: routeContract("sessions.list"),
        handler: async () => [],
      },
    );
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.kind).toBe("invalid_input");
    expect(body.trace_id).not.toBe("client-trace");
    expect(response.headers.get("x-trace-id")).toBe(body.trace_id);
    expect(authMocks.resolveAuthContext).not.toHaveBeenCalled();
  });

  test("demo cookie mutations require same origin before handler execution", async () => {
    mockDemoAuth();
    const handler = vi.fn(async () => ({ sessionId: 1 }));

    const response = await handleRoute(
      request({
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
          "x-seven-ingress": "web",
        },
        body: JSON.stringify({ query: "x", councilRef: { kind: "built_in", slug: "commons" } }),
      }),
      {
        route: routeContract("sessions.create"),
        handler,
      },
    );

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  test("demo logout denies cross-origin requests before handler execution", async () => {
    mockDemoAuth();
    const handler = vi.fn(async () => ({ success: true }));

    const response = await handleRoute(
      request({
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "x-seven-ingress": "web",
        },
      }),
      {
        route: routeContract("demo.logout"),
        handler,
      },
    );

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  test("demo logout accepts browser-owned same-origin fetch metadata", async () => {
    mockDemoAuth();
    const handler = vi.fn(async () => ({ success: true }));

    const response = await handleRoute(
      request({
        method: "POST",
        headers: {
          "sec-fetch-site": "same-origin",
          "x-seven-ingress": "web",
        },
      }),
      {
        route: routeContract("demo.logout"),
        handler,
      },
    );

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  test("demo logout accepts non-production loopback aliases on the same port", async () => {
    configMocks.serverRuntime.mockReturnValue({
      nodeEnv: "development",
      publicOrigin: "http://localhost:43217",
    });
    mockDemoAuth();
    const handler = vi.fn(async () => ({ success: true }));

    const response = await handleRoute(
      request({
        method: "POST",
        url: "http://localhost:43217/api/v1/demo/logout",
        headers: {
          origin: "http://127.0.0.1:43217",
          referer: "http://127.0.0.1:43217/",
          "sec-fetch-site": "same-origin",
          "x-seven-ingress": "web",
        },
      }),
      {
        route: routeContract("demo.logout"),
        handler,
      },
    );

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  test("demo logout rejects contradictory origin evidence before fetch metadata", async () => {
    mockDemoAuth();
    const handler = vi.fn(async () => ({ success: true }));

    const response = await handleRoute(
      request({
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "sec-fetch-site": "same-origin",
          "x-seven-ingress": "web",
        },
      }),
      {
        route: routeContract("demo.logout"),
        handler,
      },
    );

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  test("development same-origin checks reject distinct explicit origins", async () => {
    configMocks.serverRuntime.mockReturnValue({
      nodeEnv: "development",
      publicOrigin: "https://theseven.ai",
    });
    mockDemoAuth();
    const handler = vi.fn(async () => ({ success: true }));

    const response = await handleRoute(
      request({
        method: "POST",
        url: "http://127.0.0.1:43217/api/v1/demo/logout",
        headers: {
          origin: "https://theseven.ai",
          referer: "http://127.0.0.1:43217/",
          "x-seven-ingress": "web",
        },
      }),
      {
        route: routeContract("demo.logout"),
        handler,
      },
    );

    const body = await readJson(response);
    expect(response.status).toBe(403);
    expect(body.details).toEqual({ reason: "same_origin_required" });
    expect(handler).not.toHaveBeenCalled();
  });

  test("production same-origin checks reject request-derived host authority", async () => {
    mockDemoAuth();
    const handler = vi.fn(async () => ({ success: true }));

    const response = await handleRoute(
      request({
        method: "POST",
        url: "http://evil.example/api/v1/demo/logout",
        headers: {
          origin: "http://evil.example",
          "x-seven-ingress": "web",
        },
      }),
      {
        route: routeContract("demo.logout"),
        handler,
      },
    );

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  test("production same-origin checks accept the configured public origin", async () => {
    mockDemoAuth();
    const handler = vi.fn(async () => ({ success: true }));

    const response = await handleRoute(
      request({
        method: "POST",
        url: "http://evil.example/api/v1/demo/logout",
        headers: {
          origin: "http://localhost",
          "x-seven-ingress": "web",
        },
      }),
      {
        route: routeContract("demo.logout"),
        handler,
      },
    );

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  test("demo logout rejects same-site fetch metadata without same-origin evidence", async () => {
    mockDemoAuth();
    const handler = vi.fn(async () => ({ success: true }));

    const response = await handleRoute(
      request({
        method: "POST",
        headers: {
          "sec-fetch-site": "same-site",
          "x-seven-ingress": "web",
        },
      }),
      {
        route: routeContract("demo.logout"),
        handler,
      },
    );

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});
