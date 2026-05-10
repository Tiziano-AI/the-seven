import { expect, test } from "@playwright/test";

const demoCookie = process.env.SEVEN_PLAYWRIGHT_DEMO_COOKIE ?? "";
const demoEmail = process.env.SEVEN_PLAYWRIGHT_DEMO_EMAIL ?? "";
const demoExpiresAt = process.env.SEVEN_PLAYWRIGHT_DEMO_EXPIRES_AT ?? "";
const sessionId = process.env.SEVEN_PLAYWRIGHT_SESSION_ID ?? "";
const sessionQuery = process.env.SEVEN_PLAYWRIGHT_SESSION_QUERY ?? "";
const baseUrl = process.env.SEVEN_BASE_URL ?? "http://127.0.0.1:3000";
const demoCookieName = "seven_demo_session";
const hasAuthenticatedSmokeState =
  demoCookie.length > 0 &&
  demoEmail.length > 0 &&
  demoExpiresAt.length > 0 &&
  sessionId.length > 0 &&
  sessionQuery.length > 0;

test("home renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("The Seven")).toBeVisible();
});

test.describe("authenticated smoke", () => {
  test.skip(!hasAuthenticatedSmokeState, "requires live smoke auth state");

  test.beforeEach(async ({ context }) => {
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
    await expect(page.getByRole("heading", { name: sessionQuery, level: 2 })).toBeVisible();
  });
});
