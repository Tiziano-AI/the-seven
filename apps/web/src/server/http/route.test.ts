import { routeContract } from "@the-seven/contracts";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  resolveAuthContext: vi.fn(),
}));
const limiterMocks = vi.hoisted(() => ({
  admitIngressFloodLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./auth", () => ({
  resolveAuthContext: authMocks.resolveAuthContext,
}));
vi.mock("../services/ingressLimits", () => limiterMocks);
vi.mock("@the-seven/config", () => ({
  MAX_REQUEST_BODY_BYTES: 512_000,
  serverRuntime: () => ({
    publicOrigin: "http://localhost",
  }),
}));

import { handleRoute } from "./route";

function request(input: { method?: string; headers?: Record<string, string>; body?: string }) {
  return new NextRequest(
    new Request("http://localhost/api/v1/sessions", {
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
    result?: { resource: string };
  };
}

describe("handleRoute admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limiterMocks.admitIngressFloodLimit.mockResolvedValue(null);
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
    authMocks.resolveAuthContext.mockResolvedValue({
      kind: "demo",
      demoSessionId: 11,
      userId: 1,
      principal: "demo@example.com",
      openRouterKey: "demo-key",
      expiresAt: 1_800_000_000_000,
    });
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
    authMocks.resolveAuthContext.mockResolvedValue({
      kind: "demo",
      demoSessionId: 11,
      userId: 1,
      principal: "demo@example.com",
      openRouterKey: "demo-key",
      expiresAt: 1_800_000_000_000,
    });
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
    authMocks.resolveAuthContext.mockResolvedValue({
      kind: "demo",
      demoSessionId: 11,
      userId: 1,
      principal: "demo@example.com",
      openRouterKey: "demo-key",
      expiresAt: 1_800_000_000_000,
    });
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

  test("demo logout rejects same-site fetch metadata without same-origin evidence", async () => {
    authMocks.resolveAuthContext.mockResolvedValue({
      kind: "demo",
      demoSessionId: 11,
      userId: 1,
      principal: "demo@example.com",
      openRouterKey: "demo-key",
      expiresAt: 1_800_000_000_000,
    });
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

  test("success payloads are validated against the route registry", async () => {
    authMocks.resolveAuthContext.mockResolvedValue({ kind: "byok" });

    const response = await handleRoute(request({}), {
      route: routeContract("sessions.list"),
      handler: async () => [{ id: 1 }],
    });

    expect(response.status).toBe(500);
  });

  test("route registry parses path params and body before handler execution", async () => {
    authMocks.resolveAuthContext.mockResolvedValue({ kind: "byok" });
    const handler = vi.fn(async (_ctx, _request, input) => {
      expect(input.params.sessionId).toBe(42);
      expect(input.body.councilRef).toEqual({ kind: "built_in", slug: "commons" });
      return { sessionId: 43 };
    });

    const response = await handleRoute(
      request({
        method: "POST",
        headers: { "content-type": "application/json", "x-seven-ingress": "web" },
        body: JSON.stringify({ councilRef: { kind: "built_in", slug: "commons" } }),
      }),
      {
        route: routeContract("sessions.rerun"),
        params: Promise.resolve({ sessionId: "42" }),
        handler,
      },
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.result?.resource).toBe("sessions.rerun");
    expect(handler).toHaveBeenCalledOnce();
  });

  test("route registry preserves transformed path params for handlers", async () => {
    authMocks.resolveAuthContext.mockResolvedValue({ kind: "byok" });
    const handler = vi.fn(async (_ctx, _request, input) => {
      expect(input.params.locator).toEqual({ kind: "built_in", slug: "commons" });
      return {
        ref: input.params.locator,
        name: "Commons",
        phasePrompts: { phase1: "one", phase2: "two", phase3: "three" },
        outputFormats: { phase1: "one", phase2: "two", phase3: "three" },
        members: [1, 2, 3, 4, 5, 6, 7].map((memberPosition) => ({
          memberPosition,
          model: { provider: "openrouter", modelId: `provider/model-${memberPosition}` },
          tuning: null,
        })),
        editable: false,
        deletable: false,
      };
    });

    const response = await handleRoute(request({}), {
      route: routeContract("councils.get"),
      params: Promise.resolve({ locator: "built_in:commons" }),
      handler,
    });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.result?.resource).toBe("councils.get");
    expect(handler).toHaveBeenCalledOnce();
  });

  test("invalid registry path params deny before handler execution", async () => {
    authMocks.resolveAuthContext.mockResolvedValue({ kind: "byok" });
    const handler = vi.fn(async () => ({ sessionId: 1 }));

    const response = await handleRoute(request({}), {
      route: routeContract("sessions.get"),
      params: Promise.resolve({ sessionId: "abc" }),
      handler,
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.kind).toBe("invalid_input");
    expect(handler).not.toHaveBeenCalled();
  });

  test("invalid registry body denies before handler execution", async () => {
    authMocks.resolveAuthContext.mockResolvedValue({ kind: "byok" });
    const handler = vi.fn(async () => ({ sessionId: 1 }));

    const response = await handleRoute(
      request({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ councilRef: { kind: "built_in", slug: "commons" } }),
      }),
      {
        route: routeContract("sessions.create"),
        handler,
      },
    );
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.kind).toBe("invalid_input");
    expect(handler).not.toHaveBeenCalled();
  });
});
