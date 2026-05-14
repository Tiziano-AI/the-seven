import { routeContract } from "@the-seven/contracts";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AuthContext } from "./auth";

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
    nodeEnv: "production",
    publicOrigin: "http://localhost",
  }),
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
    details?: { reason?: string };
  };
}

async function expectTraceDenial(response: Response, expected: { status: number; kind: string }) {
  const body = await readJson(response);
  expect(response.status).toBe(expected.status);
  expect(body.kind).toBe(expected.kind);
  expect(body.trace_id).toBeTruthy();
  expect(response.headers.get("x-trace-id")).toBe(body.trace_id);
  return body;
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

describe("route denial envelopes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limiterMocks.admitIngressFloodLimit.mockResolvedValue(null);
  });

  test("invalid path, query, body, ingress, and auth denials carry server trace headers", async () => {
    authMocks.resolveAuthContext.mockResolvedValue({ kind: "byok" });
    const handler = vi.fn(async () => ({ sessionId: 1 }));

    await expectTraceDenial(
      await handleRoute(request({}), {
        route: routeContract("sessions.get"),
        params: Promise.resolve({ sessionId: "abc" }),
        handler,
      }),
      { status: 400, kind: "invalid_input" },
    );

    await expectTraceDenial(
      await handleRedirectRoute(
        request({
          url: "https://theseven.ai/api/v1/demo/consume",
          headers: { host: "theseven.ai", "x-seven-ingress": "api" },
        }),
        {
          route: routeContract("demo.consume"),
          handler: async () => NextResponse.redirect("https://theseven.ai/", 303),
        },
      ),
      { status: 400, kind: "invalid_input" },
    );

    await expectTraceDenial(
      await handleRoute(
        request({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ councilRef: { kind: "built_in", slug: "commons" } }),
        }),
        {
          route: routeContract("sessions.create"),
          handler,
        },
      ),
      { status: 400, kind: "invalid_input" },
    );

    await expectTraceDenial(
      await handleRoute(request({ headers: { "x-seven-ingress": "desktop" } }), {
        route: routeContract("sessions.list"),
        handler: async () => [],
      }),
      { status: 400, kind: "invalid_input" },
    );

    authMocks.resolveAuthContext.mockResolvedValue({ kind: "none" });
    const missingAuthBody = await expectTraceDenial(
      await handleRoute(
        request({
          method: "POST",
          headers: { "content-type": "application/json", "x-seven-ingress": "web" },
          body: "{}",
        }),
        {
          route: routeContract("auth.validate"),
          handler: async (ctx) => {
            requireByokAuth(ctx.auth);
            return { valid: true };
          },
        },
      ),
      { status: 401, kind: "unauthorized" },
    );
    expect(missingAuthBody.details?.reason).toBe("missing_auth");
  });

  test("invalid BYOK cannot validate auth, list councils, or enqueue sessions", async () => {
    authMocks.resolveAuthContext.mockResolvedValue({ kind: "invalid", reason: "invalid_token" });
    const validateMutation = vi.fn();
    const listMutation = vi.fn();
    const createMutation = vi.fn();
    const authHandler = async (ctx: { auth: AuthContext }) => {
      requireByokAuth(ctx.auth);
      validateMutation();
      return { valid: true };
    };
    const listHandler = async (ctx: { auth: AuthContext }) => {
      requireByokAuth(ctx.auth);
      listMutation();
      return { councils: [] };
    };
    const createHandler = async (ctx: { auth: AuthContext }) => {
      requireByokAuth(ctx.auth);
      createMutation();
      return { sessionId: 1 };
    };

    const authBody = await expectTraceDenial(
      await handleRoute(
        request({
          method: "POST",
          headers: {
            authorization: "Bearer sk-or-invalid",
            "content-type": "application/json",
            "x-seven-ingress": "web",
          },
          body: "{}",
        }),
        {
          route: routeContract("auth.validate"),
          handler: authHandler,
        },
      ),
      { status: 401, kind: "unauthorized" },
    );
    const listBody = await expectTraceDenial(
      await handleRoute(
        request({
          headers: {
            authorization: "Bearer sk-or-invalid",
            "x-seven-ingress": "web",
          },
        }),
        {
          route: routeContract("councils.list"),
          handler: listHandler,
        },
      ),
      { status: 401, kind: "unauthorized" },
    );
    const createBody = await expectTraceDenial(
      await handleRoute(
        request({
          method: "POST",
          headers: {
            authorization: "Bearer sk-or-invalid",
            "content-type": "application/json",
            "x-seven-ingress": "web",
          },
          body: JSON.stringify({
            query: "Question?",
            councilRef: { kind: "built_in", slug: "commons" },
          }),
        }),
        {
          route: routeContract("sessions.create"),
          handler: createHandler,
        },
      ),
      { status: 401, kind: "unauthorized" },
    );

    expect(authBody.details?.reason).toBe("invalid_token");
    expect(listBody.details?.reason).toBe("invalid_token");
    expect(createBody.details?.reason).toBe("invalid_token");
    expect(validateMutation).not.toHaveBeenCalled();
    expect(listMutation).not.toHaveBeenCalled();
    expect(createMutation).not.toHaveBeenCalled();
  });

  test("demo same-origin admission rejects contradictory explicit and fetch metadata", async () => {
    mockDemoAuth();
    const handler = vi.fn(async () => ({ success: true }));

    const deniedHeaders: Array<Record<string, string>> = [
      {
        origin: "http://localhost",
        referer: "https://evil.example/path",
        "x-seven-ingress": "web",
      },
      {
        origin: "http://localhost",
        "sec-fetch-site": "cross-site",
        "x-seven-ingress": "web",
      },
      {
        origin: "null",
        "x-seven-ingress": "web",
      },
    ];
    for (const headers of deniedHeaders) {
      const response = await handleRoute(
        request({
          method: "POST",
          headers,
        }),
        {
          route: routeContract("demo.logout"),
          handler,
        },
      );
      const body = await expectTraceDenial(response, { status: 403, kind: "forbidden" });
      expect(body.details?.reason).toBe("same_origin_required");
    }

    expect(handler).not.toHaveBeenCalled();
  });
});
