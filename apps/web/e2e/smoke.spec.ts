import { expect, test } from "@playwright/test";

const demoToken = process.env.SEVEN_PLAYWRIGHT_DEMO_TOKEN ?? "";
const demoEmail = process.env.SEVEN_PLAYWRIGHT_DEMO_EMAIL ?? "";
const demoExpiresAt = process.env.SEVEN_PLAYWRIGHT_DEMO_EXPIRES_AT ?? "";
const sessionId = process.env.SEVEN_PLAYWRIGHT_SESSION_ID ?? "";
const sessionQuery = process.env.SEVEN_PLAYWRIGHT_SESSION_QUERY ?? "";
const hasAuthenticatedSmokeState =
  demoToken.length > 0 &&
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

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ token, email, expiresAt }) => {
        window.localStorage.setItem("seven.demo.token", token);
        window.localStorage.setItem("seven.demo.email", email);
        window.localStorage.setItem("seven.demo.expires_at", expiresAt);
      },
      {
        token: demoToken,
        email: demoEmail,
        expiresAt: demoExpiresAt,
      },
    );
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
    await expect(page.getByText(sessionQuery, { exact: true })).toBeVisible();
  });
});
