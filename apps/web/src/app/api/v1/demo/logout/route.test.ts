import { HttpContractError } from "@the-seven/contracts";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const configMocks = vi.hoisted(() => ({
  serverRuntime: vi.fn(),
}));
const cookieMocks = vi.hoisted(() => ({
  clearDemoSessionCookie: vi.fn(),
}));
const routeMocks = vi.hoisted(() => ({
  handleRoute: vi.fn(),
}));
const serviceMocks = vi.hoisted(() => ({
  endDemoSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@the-seven/config", () => configMocks);
vi.mock("@/server/http/demoCookie", () => cookieMocks);
vi.mock("@/server/http/route", () => routeMocks);
vi.mock("@/server/services/demoAuth", () => serviceMocks);

import { POST } from "./route";

describe("demo logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configMocks.serverRuntime.mockReturnValue({ nodeEnv: "test" });
  });

  function mockHandleRouteWithAuth(
    auth: { kind: "none" } | { kind: "byok" } | { kind: "demo"; demoSessionId: number },
  ) {
    routeMocks.handleRoute.mockImplementation(async (request, input) => {
      try {
        await input.handler(
          {
            auth,
            ingress: { source: "web", version: null },
            ip: null,
            now: new Date("2026-05-12T10:00:00.000Z"),
            traceId: "trace-id",
          },
          request,
          { params: {}, query: {}, body: {} },
        );
        return NextResponse.json({ result: { payload: { success: true } } }, { status: 200 });
      } catch (error) {
        if (error instanceof HttpContractError) {
          return NextResponse.json(
            { kind: error.kind, details: error.details },
            { status: error.status },
          );
        }
        throw error;
      }
    });
  }

  test("does not clear the demo cookie when logout admission is denied", async () => {
    const denied = NextResponse.json({ kind: "forbidden" }, { status: 403 });
    routeMocks.handleRoute.mockResolvedValue(denied);

    const response = await POST(
      new NextRequest(new Request("http://localhost/api/v1/demo/logout")),
    );

    expect(response.status).toBe(403);
    expect(cookieMocks.clearDemoSessionCookie).not.toHaveBeenCalled();
  });

  test("clears the demo cookie after successful logout", async () => {
    serviceMocks.endDemoSession.mockResolvedValue(true);
    mockHandleRouteWithAuth({ kind: "demo", demoSessionId: 11 });

    const response = await POST(
      new NextRequest(new Request("http://localhost/api/v1/demo/logout")),
    );

    expect(response.status).toBe(200);
    expect(serviceMocks.endDemoSession).toHaveBeenCalledWith({
      sessionId: 11,
      now: new Date("2026-05-12T10:00:00.000Z"),
    });
    expect(cookieMocks.clearDemoSessionCookie).toHaveBeenCalledWith(response, { nodeEnv: "test" });
  });

  test("does not clear the demo cookie when revocation loses the race", async () => {
    serviceMocks.endDemoSession.mockResolvedValue(false);
    mockHandleRouteWithAuth({ kind: "demo", demoSessionId: 11 });

    const response = await POST(
      new NextRequest(new Request("http://localhost/api/v1/demo/logout")),
    );

    expect(response.status).toBe(401);
    expect(cookieMocks.clearDemoSessionCookie).not.toHaveBeenCalled();
  });

  test("does not revoke or clear for non-demo authenticated sessions", async () => {
    mockHandleRouteWithAuth({ kind: "byok" });

    const response = await POST(
      new NextRequest(new Request("http://localhost/api/v1/demo/logout")),
    );

    expect(response.status).toBe(403);
    expect(serviceMocks.endDemoSession).not.toHaveBeenCalled();
    expect(cookieMocks.clearDemoSessionCookie).not.toHaveBeenCalled();
  });

  test("does not revoke or clear for missing authentication", async () => {
    mockHandleRouteWithAuth({ kind: "none" });

    const response = await POST(
      new NextRequest(new Request("http://localhost/api/v1/demo/logout")),
    );

    expect(response.status).toBe(401);
    expect(serviceMocks.endDemoSession).not.toHaveBeenCalled();
    expect(cookieMocks.clearDemoSessionCookie).not.toHaveBeenCalled();
  });
});
