import { NextResponse } from "next/server";
import { describe, expect, test, vi } from "vitest";
import { DEMO_SESSION_COOKIE } from "./auth";
import { clearDemoSessionCookie, setDemoSessionCookie } from "./demoCookie";

vi.mock("server-only", () => ({}));

const baseEnv = {
  nodeEnv: "development",
  port: 3000,
  databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/the_seven",
  jobCredentialSecret: "0123456789abcdef",
  publicOrigin: "http://localhost:3000",
  appName: "The Seven",
  demo: {
    enabled: true,
    openRouterApiKey: "demo-key",
    resendApiKey: "resend-key",
    emailFrom: "demo@theseven.ai",
  },
} as const;

describe("demo session cookie", () => {
  test("sets the demo cookie with the canonical web authority attributes", () => {
    const response = NextResponse.json({ ok: true });

    setDemoSessionCookie({
      response,
      token: "demo-session-token",
      expiresAt: new Date("2026-05-11T06:00:00.000Z"),
      env: baseEnv,
    });

    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toContain(`${DEMO_SESSION_COOKIE}=demo-session-token`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=lax");
    expect(header).toContain("Path=/");
    expect(header).toContain("Expires=Mon, 11 May 2026 06:00:00 GMT");
    expect(header).not.toContain("Secure");
  });

  test("adds Secure in production", () => {
    const response = NextResponse.json({ ok: true });

    setDemoSessionCookie({
      response,
      token: "demo-session-token",
      expiresAt: new Date("2026-05-11T06:00:00.000Z"),
      env: { ...baseEnv, nodeEnv: "production" },
    });

    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  test("clears the demo cookie with Max-Age zero", () => {
    const response = NextResponse.json({ ok: true });

    clearDemoSessionCookie(response, baseEnv);

    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toContain(`${DEMO_SESSION_COOKIE}=`);
    expect(header).toContain("Max-Age=0");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=lax");
    expect(header).toContain("Path=/");
  });
});
