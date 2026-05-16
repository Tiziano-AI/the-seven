import type { BrowserContext, Page } from "@playwright/test";
import {
  admitDemoCookieRead,
  demoCookieName,
  fulfillSuccess,
  parseRouteBody,
  parseRouteIngress,
  parseRouteQuery,
  proofDemoSessionToken,
} from "./browser-flow-http";

function requireSevenBaseUrl(context: string): URL {
  const raw = process.env.SEVEN_BASE_URL?.trim();
  if (!raw) {
    throw new Error(`SEVEN_BASE_URL is required for ${context}.`);
  }
  return new URL(raw);
}

/** Installs a browser-flow demo cookie and route mock that denies missing/stale cookies. */
export async function installDemoSessionMock(context: BrowserContext, page: Page) {
  const origin = requireSevenBaseUrl("browser-flow demo cookie proof");
  await context.addCookies([
    {
      name: demoCookieName,
      value: proofDemoSessionToken,
      domain: origin.hostname,
      path: "/",
      expires: Math.floor((Date.now() + 86_400_000) / 1000),
      httpOnly: true,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
  await page.route("**/api/v1/demo/session", async (route) => {
    if (!(await parseRouteIngress(route, "demo.session"))) {
      return;
    }
    if ((await parseRouteQuery(route, "demo.session")) === null) {
      return;
    }
    if ((await parseRouteBody(route, "demo.session")) === null) {
      return;
    }
    if (!(await admitDemoCookieRead(route, "demo.session"))) {
      return;
    }
    await fulfillSuccess(route, "demo.session", {
      email: "reader@example.com",
      expiresAt: Date.now() + 86_400_000,
    });
  });
}
