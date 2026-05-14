import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const configMocks = vi.hoisted(() => ({
  serverRuntime: vi.fn(),
}));
const cookieMocks = vi.hoisted(() => ({
  setDemoSessionCookie: vi.fn(),
}));
const limiterMocks = vi.hoisted(() => ({
  admitIngressFloodLimit: vi.fn(),
}));
const demoLimitMocks = vi.hoisted(() => ({
  admitDemoConsume: vi.fn(),
}));
const demoAuthMocks = vi.hoisted(() => ({
  consumeDemoAuthLink: vi.fn(),
  DemoAuthError: class DemoAuthError extends Error {
    readonly kind:
      | "demo_disabled"
      | "link_not_found"
      | "link_used"
      | "link_expired"
      | "user_missing";

    constructor(input: {
      kind: "demo_disabled" | "link_not_found" | "link_used" | "link_expired" | "user_missing";
      message: string;
    }) {
      super(input.message);
      this.kind = input.kind;
    }
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@the-seven/config", () => ({
  MAX_REQUEST_BODY_BYTES: 512_000,
  serverRuntime: configMocks.serverRuntime,
}));
vi.mock("@/server/http/demoCookie", () => cookieMocks);
vi.mock("@/server/services/ingressLimits", () => limiterMocks);
vi.mock("@/server/services/demoLimits", () => demoLimitMocks);
vi.mock("@/server/services/demoAuth", () => ({
  ...demoAuthMocks,
  DemoAuthError: demoAuthMocks.DemoAuthError,
}));

import { GET } from "./route";

function consumeRequest(input: { token?: string; headers?: Record<string, string> }) {
  const url = new URL("https://theseven.ai/api/v1/demo/consume");
  if (input.token) {
    url.searchParams.set("token", input.token);
  }
  return new NextRequest(
    new Request(url, {
      headers: {
        host: "theseven.ai",
        ...input.headers,
      },
    }),
  );
}

async function readJson(response: Response) {
  return (await response.json()) as {
    trace_id: string;
    kind: string;
    details: {
      reason?: string;
      issues?: Array<{ path: string; message: string }>;
      scope?: string;
      limit?: number;
      windowSeconds?: number;
    };
  };
}

describe("demo consume route integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configMocks.serverRuntime.mockReturnValue({
      nodeEnv: "production",
      publicOrigin: "https://theseven.ai",
      demo: {
        enabled: true,
      },
    });
    limiterMocks.admitIngressFloodLimit.mockResolvedValue(null);
    demoLimitMocks.admitDemoConsume.mockResolvedValue(null);
    demoAuthMocks.consumeDemoAuthLink.mockResolvedValue({
      token: "demo-session-token",
      expiresAt: 1_800_000_000_000,
    });
  });

  test("invalid ingress denies before missing-token browser recovery", async () => {
    const deniedHeaders: Array<Record<string, string>> = [
      { "x-seven-ingress": "desktop" },
      { "x-seven-ingress-version": "x".repeat(121) },
    ];
    for (const headers of deniedHeaders) {
      const response = await GET(consumeRequest({ headers }));
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(body.kind).toBe("invalid_input");
      expect(response.headers.get("x-trace-id")).toBe(body.trace_id);
      expect(demoAuthMocks.consumeDemoAuthLink).not.toHaveBeenCalled();
      expect(cookieMocks.setDemoSessionCookie).not.toHaveBeenCalled();
    }
  });

  test("canonical API ingress missing-token requests stay on typed denial path", async () => {
    const response = await GET(consumeRequest({ headers: { "x-seven-ingress": " API " } }));
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.kind).toBe("invalid_input");
    expect(body.details.issues?.[0]?.path).toBe("query.token");
    expect(response.headers.get("x-trace-id")).toBe(body.trace_id);
    expect(demoAuthMocks.consumeDemoAuthLink).not.toHaveBeenCalled();
    expect(cookieMocks.setDemoSessionCookie).not.toHaveBeenCalled();
  });

  test("wrong public host emits typed denial before token mutation", async () => {
    const response = await GET(
      consumeRequest({
        token: "magic-token",
        headers: { host: "localhost:8080", "x-seven-ingress": "api" },
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(body.kind).toBe("forbidden");
    expect(body.details.reason).toBe("public_origin_required");
    expect(response.headers.get("x-trace-id")).toBe(body.trace_id);
    expect(demoLimitMocks.admitDemoConsume).not.toHaveBeenCalled();
    expect(demoAuthMocks.consumeDemoAuthLink).not.toHaveBeenCalled();
    expect(cookieMocks.setDemoSessionCookie).not.toHaveBeenCalled();
  });

  test("malformed public host emits typed denial before token mutation", async () => {
    const response = await GET(
      consumeRequest({
        token: "magic-token",
        headers: { host: "user@theseven.ai", "x-seven-ingress": "api" },
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(body.kind).toBe("forbidden");
    expect(body.details.reason).toBe("public_origin_required");
    expect(demoLimitMocks.admitDemoConsume).not.toHaveBeenCalled();
    expect(demoAuthMocks.consumeDemoAuthLink).not.toHaveBeenCalled();
    expect(cookieMocks.setDemoSessionCookie).not.toHaveBeenCalled();
  });

  test("equivalent public host authority reaches token consumption", async () => {
    const response = await GET(
      consumeRequest({
        token: "magic-token",
        headers: { host: "THESEVEN.AI:443", "x-seven-ingress": "api" },
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://theseven.ai/");
    expect(demoLimitMocks.admitDemoConsume).toHaveBeenCalledOnce();
    expect(demoAuthMocks.consumeDemoAuthLink).toHaveBeenCalledOnce();
    expect(cookieMocks.setDemoSessionCookie).toHaveBeenCalledOnce();
  });

  test("consume rate limits emit typed denial without token or cookie mutation", async () => {
    demoLimitMocks.admitDemoConsume.mockResolvedValueOnce({
      scope: "demo:consume:ip:127.0.0.1",
      limit: 3,
      windowSeconds: 60,
      resetAtMs: 1_800_000_060_000,
    });

    const response = await GET(
      consumeRequest({ token: "magic-token", headers: { "x-seven-ingress": "api" } }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(429);
    expect(body.kind).toBe("rate_limited");
    expect(body.details.scope).toBe("demo:consume:ip:[redacted]");
    expect(body.details.limit).toBe(3);
    expect(body.details.windowSeconds).toBe(60);
    expect(response.headers.get("x-trace-id")).toBe(body.trace_id);
    expect(demoAuthMocks.consumeDemoAuthLink).not.toHaveBeenCalled();
    expect(cookieMocks.setDemoSessionCookie).not.toHaveBeenCalled();
  });

  test.each([
    ["link_expired", 401, "unauthorized", "expired_token"],
    ["link_used", 401, "unauthorized", "invalid_token"],
    ["link_not_found", 401, "unauthorized", "invalid_token"],
    ["user_missing", 401, "unauthorized", "invalid_token"],
    ["demo_disabled", 403, "forbidden", "demo_disabled"],
  ] as const)("maps API %s to typed denial without setting a cookie", async (kind, status, envelopeKind, reason) => {
    demoAuthMocks.consumeDemoAuthLink.mockRejectedValueOnce(
      new demoAuthMocks.DemoAuthError({ kind, message: kind }),
    );

    const response = await GET(
      consumeRequest({ token: "magic-token", headers: { "x-seven-ingress": "api" } }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(status);
    expect(body.kind).toBe(envelopeKind);
    expect(body.details.reason).toBe(reason);
    expect(response.headers.get("x-trace-id")).toBe(body.trace_id);
    expect(cookieMocks.setDemoSessionCookie).not.toHaveBeenCalled();
  });
});
