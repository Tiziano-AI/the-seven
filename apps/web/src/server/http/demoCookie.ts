import "server-only";

import type { ServerRuntime } from "@the-seven/config";
import type { NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE } from "./auth";

/** Sets the canonical server-owned demo session cookie on a response. */
export function setDemoSessionCookie(input: {
  response: NextResponse;
  token: string;
  expiresAt: Date;
  env: ServerRuntime;
}) {
  input.response.cookies.set({
    name: DEMO_SESSION_COOKIE,
    value: input.token,
    httpOnly: true,
    sameSite: "lax",
    secure: input.env.nodeEnv === "production",
    path: "/",
    expires: input.expiresAt,
  });
}

/** Clears the canonical demo session cookie on logout. */
export function clearDemoSessionCookie(response: NextResponse, env: ServerRuntime) {
  response.cookies.set({
    name: DEMO_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    path: "/",
    maxAge: 0,
  });
}
