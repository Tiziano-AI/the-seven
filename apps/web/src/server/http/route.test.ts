import { routeContract } from "@the-seven/contracts";
import { NextRequest, NextResponse } from "next/server";
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

import { requireByokAuth } from "./requireAuth";
import { handleRedirectRoute, handleRoute } from "./route";

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

  test("success payloads are validated against the route registry", async () => {
    authMocks.resolveAuthContext.mockResolvedValue({ kind: "byok" });

    const response = await handleRoute(request({}), {
      route: routeContract("sessions.list"),
      handler: async () => [{ id: 1 }],
    });

    expect(response.status).toBe(500);
  });

  test("redirect status is validated against the route registry", async () => {
    authMocks.resolveAuthContext.mockResolvedValue({ kind: "none" });

    const response = await handleRedirectRoute(
      request({
        url: "https://theseven.ai/api/v1/demo/consume?token=magic-token",
        headers: { host: "theseven.ai", "x-seven-ingress": "web" },
      }),
      {
        route: routeContract("demo.consume"),
        handler: async () => NextResponse.redirect("https://theseven.ai/", 302),
      },
    );
    const body = await readJson(response);

    expect(response.status).toBe(500);
    expect(body.kind).toBe("internal_error");
  });

  test("route-level rate limiting ignores spoofed proxy client-ip headers", async () => {
    authMocks.resolveAuthContext.mockResolvedValue({ kind: "byok" });

    const response = await handleRoute(
      request({
        headers: {
          "cf-connecting-ip": "198.51.100.9",
          "x-forwarded-for": "198.51.100.10, 203.0.113.1",
          "x-seven-ingress": "web",
        },
      }),
      {
        route: routeContract("sessions.list"),
        handler: async () => [],
      },
    );

    expect(response.status).toBe(200);
    expect(limiterMocks.admitIngressFloodLimit).toHaveBeenCalledWith(
      expect.objectContaining({ ip: null }),
    );
  });

  test("BYOK mutating routes stay header-authorized across origins", async () => {
    authMocks.resolveAuthContext.mockResolvedValue({ kind: "byok", userId: 1 });
    const handler = vi.fn(async () => ({
      suggestions: [],
    }));

    const response = await handleRoute(
      request({
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
          "x-seven-ingress": "web",
        },
        body: JSON.stringify({ query: "gpt", limit: 5 }),
      }),
      {
        route: routeContract("models.autocomplete"),
        handler,
      },
    );

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  test("auth-any mutating routes keep BYOK header authority across origins", async () => {
    authMocks.resolveAuthContext.mockResolvedValue({ kind: "byok", userId: 1 });
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

    expect(response.status).toBe(201);
    expect(handler).toHaveBeenCalledOnce();
  });

  test("BYOK-only routes deny demo cookies as demo_not_allowed before same-origin checks", async () => {
    mockDemoAuth();
    const handler = vi.fn(async (ctx) => {
      requireByokAuth(ctx.auth);
      return { valid: true };
    });

    const response = await handleRoute(
      request({
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "x-seven-ingress": "web",
        },
      }),
      {
        route: routeContract("auth.validate"),
        handler,
      },
    );
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(body.details).toEqual({ reason: "demo_not_allowed" });
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

  test("invalid council locators are denied exactly before handler execution", async () => {
    authMocks.resolveAuthContext.mockResolvedValue({ kind: "byok" });
    const handler = vi.fn(async () => ({
      ref: { kind: "built_in", slug: "commons" },
      name: "Commons",
      phasePrompts: { phase1: "one", phase2: "two", phase3: "three" },
      outputFormats: { phase1: "one", phase2: "two", phase3: "three" },
      members: [],
      editable: false,
      deletable: false,
    }));

    const response = await handleRoute(request({}), {
      route: routeContract("councils.get"),
      params: Promise.resolve({ locator: "user:7junk" }),
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

  test("redirect route parses API demo consume missing-token denial through the registry", async () => {
    const handler = vi.fn(async () => NextResponse.redirect("https://theseven.ai/", 303));

    const response = await handleRedirectRoute(
      request({
        url: "https://theseven.ai/api/v1/demo/consume",
        headers: { host: "theseven.ai", "x-seven-ingress": "api" },
      }),
      {
        route: routeContract("demo.consume"),
        handler,
      },
    );
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.kind).toBe("invalid_input");
    expect(handler).not.toHaveBeenCalled();
  });
});
