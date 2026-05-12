import { expect, test } from "@playwright/test";

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

test("home renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header").getByText("The Seven", { exact: true })).toBeVisible();
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
    const logoutResponse = page.waitForResponse(
      (response) => response.url().endsWith("/api/v1/demo/logout") && response.status() === 200,
    );
    await page.getByRole("button", { name: "End Demo" }).click();
    await logoutResponse;

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
  });
});
