import { HttpContractError } from "@the-seven/contracts";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const configMocks = vi.hoisted(() => ({
  serverRuntime: vi.fn(),
}));
const routeMocks = vi.hoisted(() => ({
  handleRoute: vi.fn(),
}));
const limitMocks = vi.hoisted(() => ({
  admitDemoEmailRequest: vi.fn(),
}));
const serviceMocks = vi.hoisted(() => ({
  requestDemoAuthLink: vi.fn(),
  DemoAuthError: class DemoAuthError extends Error {
    readonly kind: "demo_disabled";

    constructor(input: { kind: "demo_disabled"; message: string }) {
      super(input.message);
      this.kind = input.kind;
    }
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@the-seven/config", () => configMocks);
vi.mock("@/server/http/route", () => routeMocks);
vi.mock("@/server/services/demoLimits", () => limitMocks);
vi.mock("@/server/services/demoAuth", () => serviceMocks);

import { POST } from "./route";

describe("demo request route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configMocks.serverRuntime.mockReturnValue({ demo: { enabled: true } });
    serviceMocks.requestDemoAuthLink.mockResolvedValue({ ok: true });
    limitMocks.admitDemoEmailRequest.mockResolvedValue(null);
    routeMocks.handleRoute.mockImplementation(async (request, input) => {
      try {
        const payload = await input.handler(
          {
            auth: { kind: "none" },
            ingress: { source: "web", version: null },
            ip: "127.0.0.1",
            now: new Date("2026-05-12T10:00:00.000Z"),
            traceId: "trace-id",
          },
          request,
          { params: {}, query: {}, body: { email: " Demo@Example.com " } },
        );
        return NextResponse.json({ result: { payload } }, { status: 200 });
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
  });

  test("rate-limit denial uses the canonical typed details constructor", async () => {
    limitMocks.admitDemoEmailRequest.mockResolvedValueOnce({
      scope: "demo:email:demo@example.com",
      limit: 3,
      windowSeconds: 60,
      resetAtMs: 1_800_000_060_000,
    });

    const response = await POST(
      new NextRequest(new Request("http://localhost/api/v1/demo/request")),
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({
      kind: "rate_limited",
      details: {
        scope: "demo:email:[redacted]",
        limit: 3,
        windowSeconds: 60,
        resetAt: "2027-01-15T08:01:00.000Z",
      },
    });
    expect(serviceMocks.requestDemoAuthLink).not.toHaveBeenCalled();
  });
});
