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

function modeButton(page: Page, name: string) {
  return page.locator(".manuscript-action-bar").getByRole("button", { name, exact: true });
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
      await expect(page.getByText("Ask once. Get one answer you can inspect.")).toBeVisible();
      await captureRenderedProof(page, testInfo, `${viewport.label}-locked`);
      await page.getByLabel("Email for a 24-hour demo").fill("reader@example.com");
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
      await expect(page.getByText(/Demo active · expires/)).toBeVisible();
      await expect(page.getByText("Demo questions use Commons")).toBeVisible();
      await captureRenderedProof(page, testInfo, `${viewport.label}-demo-composer`);

      await page.unrouteAll({ behavior: "ignoreErrors" });
      installApiMocks(page);
      await page.context().clearCookies();
      await unlockByok(page);
      await page.waitForTimeout(toastSettleMs);
      await expect(page.getByLabel("Question")).toBeVisible();
      await captureRenderedProof(page, testInfo, `${viewport.label}-byok-composer`);
      await page.getByLabel("Question").fill("Rendered proof question after filing");
      await page.getByRole("button", { name: "Ask the council" }).click();
      await expect(page.getByText("Ready for another question")).toBeVisible();
      await expect(
        page.locator(".docket-question").getByText("Rendered proof question after filing"),
      ).toBeVisible();
      await waitForToastToClear(page, "Question sent");
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
          name: "Open saved run 105: Working answer before reviews",
          exact: true,
        })
        .click();
      await modeButton(page, "Council").click();
      await expect(page.getByRole("region", { name: "Council" })).toContainText(
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
          name: "Open saved run 102: Completed vendor selection question",
          exact: true,
        })
        .click();
      await expect(page.getByText(/Final answer: approve the vendor plan/)).toBeVisible();
      await captureFocusedProof(page, testInfo, `${viewport.label}-completed-answer`, "#verdict-G");
      await modeButton(page, "How it worked").click();
      await expect(page.locator("#how-it-worked-panel")).toContainText("Draft answers");
      await page.locator("#proceedings-phase1-A").getByText("Reviewer A").click();
      await expect(page.locator("#proceedings-phase1-A")).toContainText(
        "Draft memorandum from reviewer 1.",
      );
      await page.locator("#proceedings-phase2-A").getByText("Reviewer A").click();
      await page.locator("#proceedings-phase2-A").getByText("Review details").first().click();
      await expect(page.locator("#proceedings-phase2-A")).toContainText("Strengths");
      await expect(page.locator("#proceedings-phase2-A")).toContainText("Missing evidence");
      await captureFocusedProof(
        page,
        testInfo,
        `${viewport.label}-how-it-worked`,
        "#how-it-worked-panel",
      );
      await modeButton(page, "Run details").click();
      const runDetails = page.locator("#run-details-panel");
      await expect(runDetails).toContainText("accepted model outputs recorded");
      await expect(runDetails).toContainText("billing succeeded");
      await expect(runDetails).toContainText("reasoning effort low");
      await expect(runDetails).toContainText("Phase 2 · Needs attention");
      await expect(runDetails).toContainText("code rate_limited");
      await captureFocusedProof(
        page,
        testInfo,
        `${viewport.label}-run-details`,
        "#run-details-panel",
      );
      await modeButton(page, "Exports").click();
      await expect(page.locator("#exports-panel")).toContainText("Copy and download");
      await captureFocusedProof(page, testInfo, `${viewport.label}-exports`, "#exports-panel");
      await modeButton(page, "Run again").click();
      await expect(page.getByLabel("Question for this run")).toBeVisible();
      await expect(page.getByRole("radio", { name: "The Commons Council" })).toBeChecked();
      await expect(
        page.locator("#rerun-docket").getByRole("button", { name: "Run again" }),
      ).toBeEnabled();
      await captureFocusedProof(page, testInfo, `${viewport.label}-run-again`, "#rerun-docket");
      await page
        .getByRole("button", {
          name: "Open saved run 101: Recover interrupted pricing question",
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

      await page.getByRole("link", { name: "Ask" }).click();
      await page.getByRole("link", { name: "Manage councils" }).click();
      await expect(page.getByRole("heading", { name: "Manage councils" })).toBeVisible();
      await page.getByRole("button", { name: /The Commons Council/ }).click();
      await expect(
        page.locator(".council-editor-panel").getByText("The Commons Council", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Duplicate" }).click();
      await expect(page.getByLabel("Council name")).toHaveValue("Commons Copy");
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
