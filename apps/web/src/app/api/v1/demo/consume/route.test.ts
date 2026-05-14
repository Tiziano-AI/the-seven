import { NextRequest, type NextResponse } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

type RedirectRouteHandler = (
  ctx: Readonly<{
    ip: string | null;
    now: Date;
    ingress: Readonly<{ source: "web" | "cli" | "api"; version: string | null }>;
  }>,
  request: NextRequest,
  parsed: Readonly<{ query: Readonly<{ token: string }> }>,
) => Promise<NextResponse>;

type RedirectRouteInput = Readonly<{
  preAdmission?: (request: NextRequest) => void | Promise<void>;
  handler: RedirectRouteHandler;
}>;

const configMocks = vi.hoisted(() => ({
  serverRuntime: vi.fn(),
}));
const cookieMocks = vi.hoisted(() => ({
  setDemoSessionCookie: vi.fn(),
}));
const routeMocks = vi.hoisted(() => ({
  handleRedirectRoute: vi.fn(),
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
const demoLimitMocks = vi.hoisted(() => ({
  admitDemoConsume: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@the-seven/config", () => configMocks);
vi.mock("@/server/http/demoCookie", () => cookieMocks);
vi.mock("@/server/http/route", () => routeMocks);
vi.mock("@/server/services/demoLimits", () => demoLimitMocks);
vi.mock("@/server/services/demoAuth", () => ({
  ...demoAuthMocks,
  DemoAuthError: demoAuthMocks.DemoAuthError,
}));

import { GET } from "./route";

describe("demo consume route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configMocks.serverRuntime.mockReturnValue({
      nodeEnv: "production",
      publicOrigin: "https://theseven.ai",
    });
    demoLimitMocks.admitDemoConsume.mockResolvedValue(null);
    demoAuthMocks.consumeDemoAuthLink.mockResolvedValue({
      token: "demo-session-token",
      expiresAt: 1_800_000_000_000,
    });
    routeMocks.handleRedirectRoute.mockImplementation(
      async (request: NextRequest, input: RedirectRouteInput) => {
        const preAdmissionResponse = await input.preAdmission?.(request);
        if (preAdmissionResponse) {
          return preAdmissionResponse;
        }
        return input.handler(
          {
            ip: "198.51.100.7",
            now: new Date("2026-05-11T01:00:00.000Z"),
            ingress: {
              source: request.headers.get("x-seven-ingress") === "api" ? "api" : "web",
              version: null,
            },
          },
          request,
          { query: { token: "magic-token" } },
        );
      },
    );
  });

  test("redirects to the configured public origin instead of the request origin", async () => {
    const response = await GET(
      new NextRequest(
        new Request("https://theseven.ai/api/v1/demo/consume?token=magic-token", {
          headers: { host: "theseven.ai" },
        }),
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://theseven.ai/");
    expect(demoAuthMocks.consumeDemoAuthLink).toHaveBeenCalledWith({
      token: "magic-token",
      consumedIp: "198.51.100.7",
      now: new Date("2026-05-11T01:00:00.000Z"),
    });
    expect(cookieMocks.setDemoSessionCookie).toHaveBeenCalledOnce();
  });

  test.each([
    "THESEVEN.AI",
    "theseven.ai.",
    "theseven.ai:443",
  ])("accepts equivalent public host authority %s", async (host) => {
    const response = await GET(
      new NextRequest(
        new Request("https://theseven.ai/api/v1/demo/consume?token=magic-token", {
          headers: { host },
        }),
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://theseven.ai/");
    expect(cookieMocks.setDemoSessionCookie).toHaveBeenCalledOnce();
  });

  test("denies wrong-host consume before rate-limit or token mutation", async () => {
    await expect(
      GET(
        new NextRequest(
          new Request("http://localhost:8080/api/v1/demo/consume?token=magic-token", {
            headers: { host: "localhost:8080" },
          }),
        ),
      ),
    ).rejects.toMatchObject({
      kind: "forbidden",
      details: { reason: "public_origin_required" },
    });

    expect(demoLimitMocks.admitDemoConsume).not.toHaveBeenCalled();
    expect(demoAuthMocks.consumeDemoAuthLink).not.toHaveBeenCalled();
    expect(cookieMocks.setDemoSessionCookie).not.toHaveBeenCalled();
  });

  test.each([
    "user@theseven.ai",
    "theseven.ai/path",
    "theseven.ai?x=1",
    "theseven.ai#x",
  ])("denies malformed public host authority %s before token mutation", async (host) => {
    await expect(
      GET(
        new NextRequest(
          new Request("https://theseven.ai/api/v1/demo/consume?token=magic-token", {
            headers: { host },
          }),
        ),
      ),
    ).rejects.toMatchObject({
      kind: "forbidden",
      details: { reason: "public_origin_required" },
    });

    expect(demoLimitMocks.admitDemoConsume).not.toHaveBeenCalled();
    expect(demoAuthMocks.consumeDemoAuthLink).not.toHaveBeenCalled();
    expect(cookieMocks.setDemoSessionCookie).not.toHaveBeenCalled();
  });

  test("redirects invalid browser links to the home recovery state without a cookie", async () => {
    demoAuthMocks.consumeDemoAuthLink.mockRejectedValueOnce(
      new demoAuthMocks.DemoAuthError({ kind: "link_used", message: "used" }),
    );

    const response = await GET(
      new NextRequest(
        new Request("https://theseven.ai/api/v1/demo/consume?token=magic-token", {
          headers: { host: "theseven.ai" },
        }),
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://theseven.ai/?demo_link=invalid");
    expect(cookieMocks.setDemoSessionCookie).not.toHaveBeenCalled();
  });

  test("redirects expired browser links to the expired recovery state", async () => {
    demoAuthMocks.consumeDemoAuthLink.mockRejectedValueOnce(
      new demoAuthMocks.DemoAuthError({ kind: "link_expired", message: "expired" }),
    );

    const response = await GET(
      new NextRequest(
        new Request("https://theseven.ai/api/v1/demo/consume?token=magic-token", {
          headers: { host: "theseven.ai" },
        }),
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://theseven.ai/?demo_link=expired");
    expect(cookieMocks.setDemoSessionCookie).not.toHaveBeenCalled();
  });

  test("redirects disabled browser links to the disabled recovery state", async () => {
    demoAuthMocks.consumeDemoAuthLink.mockRejectedValueOnce(
      new demoAuthMocks.DemoAuthError({ kind: "demo_disabled", message: "disabled" }),
    );

    const response = await GET(
      new NextRequest(
        new Request("https://theseven.ai/api/v1/demo/consume?token=magic-token", {
          headers: { host: "theseven.ai" },
        }),
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://theseven.ai/?demo_link=disabled");
    expect(cookieMocks.setDemoSessionCookie).not.toHaveBeenCalled();
  });

  test("keeps API invalid links on the typed denial path", async () => {
    demoAuthMocks.consumeDemoAuthLink.mockRejectedValueOnce(
      new demoAuthMocks.DemoAuthError({ kind: "link_expired", message: "expired" }),
    );

    await expect(
      GET(
        new NextRequest(
          new Request("https://theseven.ai/api/v1/demo/consume?token=magic-token", {
            headers: { host: "theseven.ai", "x-seven-ingress": "api" },
          }),
        ),
      ),
    ).rejects.toMatchObject({
      kind: "unauthorized",
      details: { reason: "expired_token" },
    });

    expect(cookieMocks.setDemoSessionCookie).not.toHaveBeenCalled();
  });

  test("redirects browser requests with missing tokens to the home recovery state before mutation", async () => {
    for (const url of [
      "https://theseven.ai/api/v1/demo/consume",
      "https://theseven.ai/api/v1/demo/consume?token=%20%20",
    ]) {
      const response = await GET(
        new NextRequest(
          new Request(url, {
            headers: { host: "theseven.ai" },
          }),
        ),
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("https://theseven.ai/?demo_link=invalid");
      expect(demoLimitMocks.admitDemoConsume).not.toHaveBeenCalled();
      expect(demoAuthMocks.consumeDemoAuthLink).not.toHaveBeenCalled();
      expect(cookieMocks.setDemoSessionCookie).not.toHaveBeenCalled();
    }
  });
});
