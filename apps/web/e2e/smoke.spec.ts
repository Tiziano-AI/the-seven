import { expect, type Response, test } from "@playwright/test";

const demoCookie = process.env.SEVEN_PLAYWRIGHT_DEMO_COOKIE ?? "";
const demoEmail = process.env.SEVEN_PLAYWRIGHT_DEMO_EMAIL ?? "";
const demoExpiresAt = process.env.SEVEN_PLAYWRIGHT_DEMO_EXPIRES_AT ?? "";
const sessionId = process.env.SEVEN_PLAYWRIGHT_SESSION_ID ?? "";
const sessionQuery = process.env.SEVEN_PLAYWRIGHT_SESSION_QUERY ?? "";
const baseUrl = process.env.SEVEN_BASE_URL;
const demoCookieName = "seven_demo_session";
const hasAuthenticatedSmokeState =
  demoCookie.length > 0 &&
  demoEmail.length > 0 &&
  demoExpiresAt.length > 0 &&
  sessionId.length > 0 &&
  sessionQuery.length > 0;

async function expectSuccessfulLogout(response: Response) {
  if (response.status() === 200) {
    return;
  }
  let body = "";
  try {
    const contentType = response.headers()["content-type"] ?? "";
    body = contentType.includes("application/json")
      ? JSON.stringify((await response.json()) as unknown)
      : await response.text();
  } catch (error) {
    body = error instanceof Error ? error.message : String(error);
  }
  throw new Error(`Demo logout returned ${response.status()}: ${body}`);
}

test("home renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header").getByText("The Seven", { exact: true })).toBeVisible();
});

test("invalid BYOK stays locked and does not store a key", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("seven.encrypted_api_key");
  });
  await page.route("**/api/v1/auth/validate", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        schema_version: 1,
        trace_id: "trace-invalid-byok",
        ts: "2026-05-12T10:00:00.000Z",
        kind: "unauthorized",
        message: "Invalid OpenRouter key",
        details: {
          reason: "invalid_token",
        },
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("LOCKED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bring Your Own Key" }).click();
  await expect(page.getByLabel("OpenRouter API Key")).toBeVisible();

  await page.getByLabel("OpenRouter API Key").fill("sk-or-invalid");
  await page.getByLabel("Local Password").fill("invalid-key-proof");
  await page.getByRole("button", { name: "Validate and Unlock" }).click();

  await expect(page.getByText("OpenRouter rejected this key")).toBeVisible();
  await expect(page.getByText("LOCKED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Validate and Unlock" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("seven.encrypted_api_key")))
    .toBeNull();
});

test("stale demo logout denial returns to locked UI", async ({ context, page }) => {
  if (!baseUrl) {
    throw new Error("SEVEN_BASE_URL is required for stale demo logout proof.");
  }
  const origin = new URL(baseUrl);
  await context.addCookies([
    {
      name: demoCookieName,
      value: "stale-demo-cookie",
      domain: origin.hostname,
      path: "/",
      expires: Math.floor((Date.now() + 60_000) / 1000),
      httpOnly: true,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
  await page.route("**/api/v1/demo/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schema_version: 1,
        trace_id: "trace-demo-session",
        ts: "2026-05-12T10:00:00.000Z",
        result: {
          resource: "demo.session",
          payload: {
            email: "demo@example.com",
            expiresAt: Date.now() + 60_000,
          },
        },
      }),
    });
  });
  await page.route("**/api/v1/demo/logout", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        schema_version: 1,
        trace_id: "trace-demo-logout",
        ts: "2026-05-12T10:00:00.000Z",
        kind: "unauthorized",
        message: "Missing or invalid authentication",
        details: {
          reason: "invalid_token",
        },
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("DEMO", { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "End Demo" }).click();

  await expect(page.getByText("LOCKED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "End Demo" })).toBeHidden();
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
    await expect(page.locator(".ask-band").getByText(sessionQuery)).toBeVisible();
  });

  test("End Demo revokes server authority", async ({ context, page }) => {
    if (!baseUrl) {
      throw new Error("SEVEN_BASE_URL is required for authenticated smoke.");
    }
    await page.goto("/");
    await expect(page.getByText("DEMO", { exact: true })).toBeVisible();

    page.once("dialog", (dialog) => {
      void dialog.accept();
    });
    const logoutResponse = page.waitForResponse((response) =>
      response.url().endsWith("/api/v1/demo/logout"),
    );
    await page.getByRole("button", { name: "End Demo" }).click();
    await expectSuccessfulLogout(await logoutResponse);

    await expect(page.getByText("LOCKED", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "End Demo" })).toBeHidden();
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
  });
});
