import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getOrCreateUser: vi.fn(),
}));
const openRouterMocks = vi.hoisted(() => ({
  validateOpenRouterApiKey: vi.fn(),
}));
const demoMocks = vi.hoisted(() => ({
  getDemoSessionContext: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@the-seven/db", () => dbMocks);
vi.mock("../adapters/openrouter", () => openRouterMocks);
vi.mock("../services/demoAuth", () => demoMocks);
vi.mock("@the-seven/config", () => ({
  serverRuntime: () => ({
    demo: {
      enabled: true,
      openRouterApiKey: "demo-openrouter-key",
    },
  }),
}));

import { DEMO_SESSION_COOKIE, resolveAuthContext } from "./auth";

function buildRequest(input: { authorization?: string; cookie?: string }) {
  const headers = new Headers();
  if (input.authorization) {
    headers.set("authorization", input.authorization);
  }
  if (input.cookie) {
    headers.set("cookie", input.cookie);
  }
  return new NextRequest(new Request("http://localhost/api/v1/sessions", { headers }));
}

describe("resolveAuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("invalid BYOK does not create a user", async () => {
    openRouterMocks.validateOpenRouterApiKey.mockResolvedValue(false);

    const auth = await resolveAuthContext(
      buildRequest({ authorization: "Bearer sk-or-invalid" }),
      new Date("2026-05-09T00:00:00.000Z"),
    );

    expect(auth).toEqual({ kind: "invalid", reason: "invalid_token" });
    expect(dbMocks.getOrCreateUser).not.toHaveBeenCalled();
  });

  test("legacy Demo authorization header is invalid", async () => {
    const auth = await resolveAuthContext(
      buildRequest({ authorization: "Demo demo-token" }),
      new Date("2026-05-09T00:00:00.000Z"),
    );

    expect(auth).toEqual({ kind: "invalid", reason: "invalid_token" });
    expect(openRouterMocks.validateOpenRouterApiKey).not.toHaveBeenCalled();
  });

  test("valid demo cookie resolves to demo auth", async () => {
    demoMocks.getDemoSessionContext.mockResolvedValue({
      kind: "active",
      sessionId: 11,
      userId: 4,
      principal: "demo@example.com",
      expiresAt: 1_800_000_000_000,
    });

    const auth = await resolveAuthContext(
      buildRequest({ cookie: `${DEMO_SESSION_COOKIE}=cookie-token` }),
      new Date("2026-05-09T00:00:00.000Z"),
    );

    expect(auth).toEqual({
      kind: "demo",
      demoSessionId: 11,
      userId: 4,
      principal: "demo@example.com",
      openRouterKey: "demo-openrouter-key",
      expiresAt: 1_800_000_000_000,
    });
  });

  test("revoked demo cookies resolve to invalid token", async () => {
    demoMocks.getDemoSessionContext.mockResolvedValue({ kind: "missing" });

    const auth = await resolveAuthContext(
      buildRequest({ cookie: `${DEMO_SESSION_COOKIE}=revoked-cookie-token` }),
      new Date("2026-05-09T00:00:00.000Z"),
    );

    expect(auth).toEqual({ kind: "invalid", reason: "invalid_token" });
  });
});
