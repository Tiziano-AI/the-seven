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

vi.mock("server-only", () => ({}));
vi.mock("@the-seven/config", () => configMocks);
vi.mock("@/server/http/demoCookie", () => cookieMocks);
vi.mock("@/server/http/route", () => routeMocks);

import { POST } from "./route";

describe("demo logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configMocks.serverRuntime.mockReturnValue({ nodeEnv: "test" });
  });

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
    const success = NextResponse.json({ result: { payload: { success: true } } }, { status: 200 });
    routeMocks.handleRoute.mockResolvedValue(success);

    const response = await POST(
      new NextRequest(new Request("http://localhost/api/v1/demo/logout")),
    );

    expect(response.status).toBe(200);
    expect(cookieMocks.clearDemoSessionCookie).toHaveBeenCalledWith(success, { nodeEnv: "test" });
  });
});
