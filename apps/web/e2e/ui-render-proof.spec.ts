import { expect, type Page, test } from "@playwright/test";
import { unlockByok } from "./browser-flow-auth";
import { installDemoSessionMock } from "./browser-flow-demo-session";
import { installApiMocks } from "./browser-flow-fixtures";
import {
  fulfillSuccess,
  fulfillUnauthorized,
  parseRouteBody,
  parseRouteIngress,
  parseRouteQuery,
} from "./browser-flow-http";
import {
  captureFocusedProof,
  captureRenderedProof,
  generateContactSheet,
  proofViewports,
  resetRenderProofDirectory,
} from "./ui-render-proof-artifacts";

const toastSettleMs = 4200;

async function waitForToastToClear(page: Page, text: string) {
  await expect(page.getByText(text)).toBeHidden({ timeout: toastSettleMs + 1000 });
}

async function denyDemoSession(page: Page) {
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
    await fulfillUnauthorized(route, "demo.session");
  });
}

async function allowDemoSession(page: Page) {
  await installDemoSessionMock(page.context(), page);
}

async function allowDemoRequest(page: Page) {
  await page.route("**/api/v1/demo/request", async (route) => {
    if (!(await parseRouteIngress(route, "demo.request"))) {
      return;
    }
    if ((await parseRouteQuery(route, "demo.request")) === null) {
      return;
    }
    if ((await parseRouteBody(route, "demo.request")) === null) {
      return;
    }
    await fulfillSuccess(route, "demo.request", { email: "reader@example.com" });
  });
}

test.describe("rendered scholarly workbench proof", () => {
  test.beforeAll(resetRenderProofDirectory);

  test.afterAll(generateContactSheet);

  for (const viewport of proofViewports) {
    test(`${viewport.label} states are captured`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await denyDemoSession(page);
      await allowDemoRequest(page);
      await page.goto("/");
      await expect(page.getByText("Seven independent readings")).toBeVisible();
      await captureRenderedProof(page, testInfo, `${viewport.label}-locked`);
      await page.getByLabel("Email for a 24-hour demo seal").fill("reader@example.com");
      await page.getByRole("button", { name: "Send magic link" }).click();
      await expect(page.getByText("Check your inbox")).toBeVisible();
      await page.waitForTimeout(toastSettleMs);
      await captureFocusedProof(
        page,
        testInfo,
        `${viewport.label}-demo-receipt`,
        "#demo-request-receipt",
      );

      await page.unroute("**/api/v1/demo/session");
      installApiMocks(page);
      await allowDemoSession(page);
      await page.reload();
      await expect(page.getByText(/Demo seal · expires/)).toBeVisible();
      await expect(page.getByText("Demo petitions are locked to Commons")).toBeVisible();
      await captureRenderedProof(page, testInfo, `${viewport.label}-demo-composer`);

      await page.unrouteAll({ behavior: "ignoreErrors" });
      installApiMocks(page);
      await page.context().clearCookies();
      await unlockByok(page);
      await page.waitForTimeout(toastSettleMs);
      await expect(page.getByLabel("Matter")).toBeVisible();
      await captureRenderedProof(page, testInfo, `${viewport.label}-byok-composer`);
      await page.getByLabel("Matter").fill("Rendered proof petition after filing");
      await page.getByRole("button", { name: "Submit for deliberation" }).click();
      await expect(page.getByText("File another matter")).toBeVisible();
      await expect(
        page.locator(".docket-question").getByText("Matter with evidence"),
      ).toBeVisible();
      await waitForToastToClear(page, "Deliberation submitted");
      await captureFocusedProof(
        page,
        testInfo,
        `${viewport.label}-submitted-workbench`,
        ".docket-question",
      );

      await page.getByRole("link", { name: "Archive" }).click();
      await expect(page.getByRole("heading", { name: "Archive" })).toBeVisible();
      await captureRenderedProof(page, testInfo, `${viewport.label}-archive`);
      await page
        .getByRole("button", {
          name: "Open manuscript for matter 105: Awaiting first scholia docket",
          exact: true,
        })
        .click();
      await expect(page.getByRole("region", { name: "Council proceedings" })).toContainText(
        "Reviewers convening",
      );
      await captureFocusedProof(
        page,
        testInfo,
        `${viewport.label}-processing-run`,
        ".archive-detail-panel",
      );
      await page
        .getByRole("button", {
          name: "Open manuscript for matter 102: Completed petition on guild tolls",
          exact: true,
        })
        .click();
      await expect(page.getByText(/Final verdict: grant the guild toll petition/)).toBeVisible();
      await captureFocusedProof(
        page,
        testInfo,
        `${viewport.label}-completed-verdict`,
        "#verdict-G",
      );
      await page.getByRole("button", { name: "Provider Record" }).click();
      const providerRecord = page.locator("#provider-record-panel");
      await expect(providerRecord).toContainText("accepted provider outputs recorded");
      await expect(providerRecord).toContainText("billing succeeded");
      await expect(providerRecord).toContainText("reasoning effort low");
      await expect(providerRecord).toContainText("Phase 2 · Needs attention");
      await expect(providerRecord).toContainText("code rate_limited");
      await captureFocusedProof(
        page,
        testInfo,
        `${viewport.label}-provider-record`,
        "#provider-record-panel",
      );
      await page
        .getByRole("button", {
          name: "Open manuscript for matter 101: Recover interrupted chancery petition",
          exact: true,
        })
        .click();
      await expect(page.getByRole("heading", { name: "Recovery record" })).toBeVisible();
      await expect(page.locator(".recovery-grid")).toContainText("Terminal note");
      await captureFocusedProof(
        page,
        testInfo,
        `${viewport.label}-failed-recovery`,
        "#recovery-ledger",
      );

      await page.getByRole("link", { name: "Council Library" }).click();
      await expect(page.getByRole("heading", { name: "Council Library" })).toBeVisible();
      await page.getByRole("button", { name: /The Commons Council/ }).click();
      await expect(page.getByLabel("Name")).toHaveValue("The Commons Council");
      await page.getByRole("button", { name: "Duplicate" }).click();
      await expect(page.getByLabel("Name")).toHaveValue("Commons Copy");
      await expect(page.locator(".model-suggestion-ledger")).toHaveCount(0);
      const firstSeat = page.locator(".role-card").first();
      await firstSeat.getByRole("button", { name: "Change Seat A model catalog" }).click();
      await firstSeat.getByRole("combobox", { name: "Search Seat A catalog" }).fill("claude");
      await expect(firstSeat.locator(".model-suggestion-ledger")).toHaveCount(1);
      await expect(page.locator(".model-suggestion-ledger")).toHaveCount(1);
      await firstSeat.getByRole("option", { name: /Claude Opus 4.7/ }).click();
      await expect(page.locator(".model-suggestion-ledger")).toHaveCount(0);
      await expect(firstSeat.getByText("7 supported parameters")).toBeVisible();
      await expect(page.getByText("Council duplicated")).toBeHidden();
      await captureRenderedProof(page, testInfo, `${viewport.label}-council-editor`);
    });
  }
});
