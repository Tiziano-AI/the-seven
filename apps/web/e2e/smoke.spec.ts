import { expect, type Response, test } from "@playwright/test";
import { hasJsonApiNoStore } from "@the-seven/contracts";
import { installDemoSessionMock } from "./browser-flow-demo-session";
import { installApiMocks } from "./browser-flow-fixtures";
import {
  fulfillUnauthorized,
  parseRouteBody,
  parseRouteIngress,
  parseRouteQuery,
  requireDemoCookieMutationSameOrigin,
} from "./browser-flow-http";

const demoCookie = process.env.SEVEN_PLAYWRIGHT_DEMO_COOKIE ?? "";
const demoEmail = process.env.SEVEN_PLAYWRIGHT_DEMO_EMAIL ?? "";
const demoExpiresAt = process.env.SEVEN_PLAYWRIGHT_DEMO_EXPIRES_AT ?? "";
const sessionId = process.env.SEVEN_PLAYWRIGHT_SESSION_ID ?? "";
const sessionQuery = process.env.SEVEN_PLAYWRIGHT_SESSION_QUERY ?? "";
const baseUrl = process.env.SEVEN_BASE_URL;
const demoCookieName = "seven_demo_session";
const authenticatedSmokeEnv = {
  SEVEN_PLAYWRIGHT_DEMO_COOKIE: demoCookie,
  SEVEN_PLAYWRIGHT_DEMO_EMAIL: demoEmail,
  SEVEN_PLAYWRIGHT_DEMO_EXPIRES_AT: demoExpiresAt,
  SEVEN_PLAYWRIGHT_SESSION_ID: sessionId,
  SEVEN_PLAYWRIGHT_SESSION_QUERY: sessionQuery,
};
const presentAuthenticatedSmokeKeys = Object.entries(authenticatedSmokeEnv)
  .filter(([, value]) => value.length > 0)
  .map(([key]) => key);
const missingAuthenticatedSmokeKeys = Object.entries(authenticatedSmokeEnv)
  .filter(([, value]) => value.length === 0)
  .map(([key]) => key);
const hasAuthenticatedSmokeState =
  demoCookie.length > 0 &&
  demoEmail.length > 0 &&
  demoExpiresAt.length > 0 &&
  sessionId.length > 0 &&
  sessionQuery.length > 0;

if (presentAuthenticatedSmokeKeys.length > 0 && missingAuthenticatedSmokeKeys.length > 0) {
  throw new Error(
    `Authenticated smoke state is all-or-none; missing ${missingAuthenticatedSmokeKeys.join(", ")}.`,
  );
}

async function expectSuccessfulLogout(response: Response) {
  const headers = response.headers();
  const body = await readResponseBody(response);
  if (response.status() === 200) {
    const envelope = body as {
      trace_id?: string;
      result?: { payload?: { success?: boolean } };
    };
    expect(hasJsonApiNoStore(headers["cache-control"] ?? null)).toBe(true);
    expect(envelope).toMatchObject({
      result: {
        payload: { success: true },
      },
    });
    expect(headers["x-trace-id"]).toBe(envelope.trace_id);
    return;
  }
  throw new Error(`Demo logout returned ${response.status()}: ${JSON.stringify(body)}`);
}

async function readResponseBody(response: Response) {
  try {
    const contentType = response.headers()["content-type"] ?? "";
    return contentType.includes("application/json")
      ? ((await response.json()) as unknown)
      : await response.text();
  } catch (error) {
    return { parseError: error instanceof Error ? error.message : String(error) };
  }
}

test("home renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header").getByText("The Seven", { exact: true })).toBeVisible();
});

test("skip link uses route-neutral main-content copy", async ({ page }) => {
  for (const route of ["/", "/councils", "/sessions", "/sessions/101"]) {
    await page.goto(route);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  }
});

test("locked routes keep route-owner headings", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ask", level: 1 })).toBeVisible();

  await page.goto("/councils");
  await expect(page.getByRole("heading", { name: "Manage councils", level: 1 })).toBeVisible();

  await page.goto("/sessions");
  await expect(page.getByRole("heading", { name: "Archive", level: 1 })).toBeVisible();

  await page.goto("/sessions/101");
  await expect(page.getByRole("heading", { name: "Saved run", level: 1 })).toBeVisible();
});

test("invalid BYOK stays locked and does not store a key", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("seven.encrypted_api_key");
  });
  await page.route("**/api/v1/auth/validate", async (route) => {
    if (!(await parseRouteIngress(route, "auth.validate"))) {
      return;
    }
    if ((await parseRouteQuery(route, "auth.validate")) === null) {
      return;
    }
    if ((await parseRouteBody(route, "auth.validate")) === null) {
      return;
    }
    await fulfillUnauthorized(route, "auth.validate", "invalid_token");
  });

  await page.goto("/");
  await expect(page.getByText("Ask once. Get one answer you can inspect.")).toBeVisible();
  await page.getByRole("button", { name: /Use your OpenRouter key/u }).click();
  await expect(page.getByLabel("OpenRouter API key")).toBeVisible();
  await expect(page.getByLabel("OpenRouter API key")).toBeFocused();

  await page.getByLabel("OpenRouter API key").fill("sk-or-invalid");
  await page.getByLabel("Local Password").fill("invalid-key-proof");
  await page.getByRole("button", { name: "Save and unlock key" }).click();

  await expect(page.locator("#byok-key-issue")).toContainText("OpenRouter rejected this key");
  await expect(page.locator("#byok-key-issue")).toContainText(
    "Check that this is a valid OpenRouter API key, or use the 24-hour demo instead.",
  );
  await expect(page.getByText("Ask once. Get one answer you can inspect.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save and unlock key" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("seven.encrypted_api_key")))
    .toBeNull();
});

test("stale demo logout denial returns to locked UI", async ({ context, page }) => {
  if (!baseUrl) {
    throw new Error("SEVEN_BASE_URL is required for stale demo logout proof.");
  }
  installApiMocks(page);
  await installDemoSessionMock(context, page);
  await expect
    .poll(async () => {
      const cookies = await context.cookies(baseUrl);
      return cookies.some((cookie) => cookie.name === demoCookieName);
    })
    .toBe(true);
  await page.route("**/api/v1/demo/logout", async (route) => {
    if (!(await parseRouteIngress(route, "demo.logout"))) {
      return;
    }
    if (!(await requireDemoCookieMutationSameOrigin(route, "demo.logout"))) {
      return;
    }
    if ((await parseRouteQuery(route, "demo.logout")) === null) {
      return;
    }
    if ((await parseRouteBody(route, "demo.logout")) === null) {
      return;
    }
    await fulfillUnauthorized(route, "demo.logout", "invalid_token");
  });

  const demoSessionResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/demo/session"),
  );
  await page.goto("/");
  const sessionResponse = await demoSessionResponse;
  expect(sessionResponse.status()).toBe(200);
  const sessionEnvelope = (await sessionResponse.json()) as {
    result: { payload: { expiresAt: number } };
  };
  expect(sessionEnvelope.result.payload.expiresAt).toBeGreaterThan(Date.now() + 60_000);
  await expect(page.locator("header").getByText(/Demo/)).toBeVisible();

  const endDemoButton = page.locator("header").getByRole("button", {
    name: "End demo",
    exact: true,
  });
  await expect(endDemoButton).toBeEnabled();
  await endDemoButton.click();
  await expect(page.getByText(/returns to the locked state/)).toBeVisible();
  await page.getByRole("button", { name: "End demo session" }).click();

  await expect(page.getByText("Ask once. Get one answer you can inspect.")).toBeVisible();
  await expect(page.getByRole("button", { name: "End demo", exact: true })).toBeHidden();
});

test.describe("authenticated smoke", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!hasAuthenticatedSmokeState, "requires live smoke auth state");

  test.beforeEach(async ({ context }) => {
    if (!baseUrl) {
      throw new Error("SEVEN_BASE_URL is required for authenticated smoke.");
    }
    const origin = new URL(baseUrl);
    await context.addCookies([
      {
        name: demoCookieName,
        value: demoCookie,
        domain: origin.hostname,
        path: "/",
        expires: Math.floor(Number(demoExpiresAt) / 1000),
        httpOnly: true,
        secure: origin.protocol === "https:",
        sameSite: "Lax",
      },
    ]);
  });

  test("councils page renders under local auth state", async ({ page }) => {
    await page.goto("/councils");
    await expect(
      page.getByText(
        "Demo mode is locked to the Commons Council. Council authoring is available only in BYOK mode.",
      ),
    ).toBeVisible();
  });

  test("session page renders after a created session", async ({ page }) => {
    await page.goto(`/sessions/${sessionId}`);
    await expect(page.locator(".docket-question").getByText(sessionQuery)).toBeVisible();
  });

  test("End demo revokes server authority", async ({ context, page }) => {
    if (!baseUrl) {
      throw new Error("SEVEN_BASE_URL is required for authenticated smoke.");
    }
    await page.goto("/");
    await expect(page.locator("header").getByText(/Demo/)).toBeVisible();

    const logoutResponse = page.waitForResponse((response) =>
      response.url().endsWith("/api/v1/demo/logout"),
    );
    await page.getByRole("button", { name: "End demo", exact: true }).click();
    await expect(page.getByText(/returns to the locked state/)).toBeVisible();
    await page.getByRole("button", { name: "End demo session" }).click();
    await expectSuccessfulLogout(await logoutResponse);

    await expect(page.getByText("Ask once. Get one answer you can inspect.")).toBeVisible();
    await expect(page.getByRole("button", { name: "End demo", exact: true })).toBeHidden();
    const cookies = await context.cookies(baseUrl);
    expect(cookies.some((cookie) => cookie.name === demoCookieName)).toBe(false);

    const sessionResponse = await page.request.get(
      new URL("/api/v1/demo/session", baseUrl).toString(),
      {
        headers: {
          Cookie: `${demoCookieName}=${demoCookie}`,
          "X-Seven-Ingress": "web",
        },
      },
    );
    expect(sessionResponse.status()).toBe(401);
    const denial = (await sessionResponse.json()) as {
      kind: string;
      trace_id: string;
      details: { reason: string };
    };
    expect(denial.kind).toBe("unauthorized");
    expect(denial.details.reason).toBe("invalid_token");
    expect(sessionResponse.headers()["x-trace-id"]).toBe(denial.trace_id);
    expect(hasJsonApiNoStore(sessionResponse.headers()["cache-control"] ?? null)).toBe(true);
  });
});
