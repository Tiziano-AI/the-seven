import { readFile } from "node:fs/promises";
import { type Download, expect, type Page, test } from "@playwright/test";
import { unlockByok } from "./browser-flow-auth";
import { builtInCommonsRef, builtInLanternRef, installApiMocks } from "./browser-flow-fixtures";
import {
  expectRunDetailsLedger,
  open102,
  openCouncilMode,
  openRunAgainMode,
  openSavedRun,
  runAgainSubmitButton,
} from "./browser-sessions-helpers";

const railModeLabels = [
  "Answer",
  "How it worked",
  "Council",
  "Run details",
  "Exports",
  "Run again",
];

async function railGeometry(page: Page) {
  const result: Record<string, { x: number; y: number; width: number; height: number }> = {};
  for (const label of railModeLabels) {
    const box = await page
      .locator(".manuscript-action-bar")
      .getByRole("button", { name: label, exact: true })
      .boundingBox();
    if (!box) {
      throw new Error(`Mode rail button ${label} was not visible.`);
    }
    result[label] = {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    };
  }
  return result;
}

test("sessions search, select, export, continue, and rerun are browser-proven", async ({
  context,
  page,
}) => {
  const state = installApiMocks(page);
  await unlockByok(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });
  await page.evaluate(() => window.localStorage.setItem("seven.active_session_id", "102"));
  await page.getByRole("link", { name: "Archive" }).click();

  await expect(
    page.locator(".panel", { hasText: "Recover interrupted pricing question" }),
  ).toBeVisible();
  await expect(
    page.locator(".panel", { hasText: "Completed vendor selection question" }),
  ).toBeVisible();
  await expect(page.getByText("Select a saved run to inspect its answer.")).toBeVisible();
  await expect(page.locator(".docket-question")).toHaveCount(0);
  await expect(page.locator(".archive-row-active")).toHaveCount(0);

  await page.getByLabel("Search archive").fill("Recover");
  await expect(
    page.locator(".panel", { hasText: "Recover interrupted pricing question" }),
  ).toBeVisible();
  await expect(
    page.locator(".panel", { hasText: "Completed vendor selection question" }),
  ).toBeHidden();
  await page.getByLabel("Search archive").fill("");

  const failedRow = page.locator(".panel", { hasText: "Recover interrupted pricing question" });
  await expect(failedRow.getByRole("button", { name: /Continue|Run again|Recovery/u })).toHaveCount(
    0,
  );
  await failedRow.getByRole("button", { name: /Add run 101 to export/u }).click();
  const exportedDownloads: Download[] = [];
  page.on("download", (download) => {
    exportedDownloads.push(download);
  });
  await page
    .locator(".archive-grid > .card")
    .first()
    .getByRole("button", { name: "Export selected (1)" })
    .click();
  await expect
    .poll(() => exportedDownloads.map((download) => download.suggestedFilename()).sort())
    .toEqual(["selected-runs.json", "selected-runs.md"]);
  const markdownDownload = exportedDownloads.find(
    (download) => download.suggestedFilename() === "selected-runs.md",
  );
  const jsonDownload = exportedDownloads.find(
    (download) => download.suggestedFilename() === "selected-runs.json",
  );
  if (!markdownDownload || !jsonDownload) {
    throw new Error("Archive export did not emit both selected-run downloads.");
  }
  const markdownPath = await markdownDownload.path();
  const jsonPath = await jsonDownload.path();
  if (!markdownPath || !jsonPath) {
    throw new Error("Archive export downloads were not materialized to disk.");
  }
  await expect.poll(() => readFile(markdownPath, "utf8")).toBe("# Run 101");
  await expect.poll(() => readFile(jsonPath, "utf8")).toBe('{"ok":true}');
  await expect.poll(() => state.exportBodies.length).toBe(1);
  expect(state.exportBodies[0]).toEqual({ sessionIds: [101] });

  await openSavedRun(failedRow, "Open saved run 101: Recover interrupted pricing question");
  await expect(page.getByRole("heading", { name: "Recovery record" })).toBeVisible();
  await expect(page.locator(".recovery-grid dd", { hasText: "Critique phase failed" })).toHaveText(
    "Critique phase failed",
  );
  await expect(
    page.locator(".recovery-grid dd", { hasText: "Final server note from the failed job" }),
  ).toContainText("Run details");
  await expect(
    page.locator(".recovery-grid dd", { hasText: "OpenRouter request failed" }),
  ).toContainText("rate-limit response");
  await expect(page.getByText("No artifacts were preserved before failure.")).toBeVisible();
  await expect(page.getByText(/original run snapshot/)).toBeVisible();
  await expect(page.getByText(/original council selected when available/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue this run" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Council" })).toHaveCount(0);
  const continueResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/sessions/101/continue"),
  );
  await page.getByRole("button", { name: "Continue this run" }).click();
  await expect(page.getByRole("button", { name: "Continuing…" })).toBeDisabled();
  await expect(
    page.locator("#recovery-ledger").getByRole("button", { name: "Edit and run again" }),
  ).toBeDisabled();
  await continueResponse;
  await expect.poll(() => state.continueSessionIds).toEqual([101]);

  const completedRow = page.locator(".panel", { hasText: "Completed vendor selection question" });
  await expect(completedRow.getByRole("button", { name: /Run again|Recovery/u })).toHaveCount(0);
  await openSavedRun(completedRow, open102);
  await expect(
    page.locator(".docket-question").getByText("Completed vendor selection question"),
  ).toBeVisible();
  await expect(page.locator(".docket-meta")).toContainText("browser");
  const track = await openCouncilMode(page);
  await expect(track.locator(".cell")).toHaveCount(7);
  await expect(track.locator("#cand-A .cell-label")).toHaveText("Qwen3.6 35B A3B");
  await expect(track.locator("#cand-A .cell-model")).toHaveText("qwen/qwen3.6-35b-a3b");
  await expect(track.locator("#cand-A .cell-model")).toHaveAttribute(
    "title",
    "qwen/qwen3.6-35b-a3b",
  );
  await expect(track).toContainText("All 6 reviewer rankings point to F");
  await expect(track.locator("#cand-G")).toContainText("answer entered");
  await page
    .locator(".manuscript-action-bar")
    .getByRole("button", { name: "Answer", exact: true })
    .click();
  await expect(page.getByText(/The final answer weighs cited evidence/)).toBeVisible();

  await page
    .locator(".manuscript-action-bar")
    .getByRole("button", { name: "Exports", exact: true })
    .click();
  await page.getByRole("button", { name: "Copy answer", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("Final answer: approve the vendor plan");
  await page.getByRole("button", { name: "Copy answer with notes" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Notes:");
  await page.getByRole("button", { name: "Copy private link" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("/sessions/102");

  const runDownloadStart = exportedDownloads.length;
  await page.getByRole("button", { name: "Download answer" }).click();
  await page.getByRole("button", { name: "Download full record" }).click();
  await expect
    .poll(() =>
      exportedDownloads
        .slice(runDownloadStart)
        .map((download) => download.suggestedFilename())
        .sort(),
    )
    .toEqual(["answer-102.md", "full-record-102.json"]);
  const answerMarkdownDownload = exportedDownloads.find(
    (download) => download.suggestedFilename() === "answer-102.md",
  );
  const fullRecordDownload = exportedDownloads.find(
    (download) => download.suggestedFilename() === "full-record-102.json",
  );
  if (!answerMarkdownDownload || !fullRecordDownload) {
    throw new Error("Run export did not emit answer and full-record downloads.");
  }
  const answerMarkdownPath = await answerMarkdownDownload.path();
  const fullRecordPath = await fullRecordDownload.path();
  if (!answerMarkdownPath || !fullRecordPath) {
    throw new Error("Run export downloads were not materialized to disk.");
  }
  await expect.poll(() => readFile(answerMarkdownPath, "utf8")).toContain("# Answer 102");
  await expect.poll(() => readFile(fullRecordPath, "utf8")).toBe('{"ok":true}');
  await expect.poll(() => state.exportBodies.length).toBe(2);
  expect(state.exportBodies[1]).toEqual({ sessionIds: [102] });

  await page
    .locator(".manuscript-action-bar")
    .getByRole("button", { name: "Answer", exact: true })
    .click();
  await page.locator('.chip[data-chip-target="proceedings-phase1-A"]').click();
  await expect(page.locator("#proceedings-phase1-A")).toBeInViewport();
  await expect(page.locator("#how-it-worked-panel")).toBeVisible();
  await page
    .locator(".manuscript-action-bar")
    .getByRole("button", { name: "Council", exact: true })
    .click();
  await page.locator("#cand-A").click();
  await expect(page.locator("#proceedings-phase2-A")).toBeInViewport();
  await expect(page.locator("#proceedings-phase2-A")).toContainText("score 100");
  await expect(page.locator("#proceedings-phase2-A")).toContainText("Strengths");
  await expect(page.locator("#proceedings-phase2-A")).toContainText("Weaknesses");
  await expect(page.locator("#proceedings-phase2-A")).toContainText("Critical errors");
  await expect(page.locator("#proceedings-phase2-A")).toContainText("Missing evidence");
  await expect(page.locator("#proceedings-phase2-A")).toContainText("Final-answer input");
  await expect(page.locator("#proceedings-phase2-A")).toContainText("Best final-answer inputs");
  await expect(page.locator("#proceedings-phase2-A")).toContainText("Major disagreements");

  await expectRunDetailsLedger(page);

  const noVotesRow = page.locator(".panel", { hasText: "Working answer before reviews" });
  await openSavedRun(noVotesRow, "Open saved run 105: Working answer before reviews");
  await expect(await openCouncilMode(page)).toContainText("Reviewers convening");

  const oneVoteRow = page.locator(".panel", { hasText: "Single-review vendor dispute" });
  await openSavedRun(oneVoteRow, "Open saved run 106: Single-review vendor dispute");
  const oneVoteTrack = await openCouncilMode(page);
  await expect(oneVoteTrack).toContainText("1 of 6 reviewer rankings entered");
  await expect(oneVoteTrack).toContainText("strongest signal A");

  await page
    .getByRole("button", {
      name: "Open saved run 107: Split evidence on launch risk",
      exact: true,
    })
    .click();
  const splitTrack = await openCouncilMode(page);
  await expect(splitTrack).toContainText("4 reviewer rankings point to A");
  await expect(splitTrack).toContainText("2 dissenting rankings");
  await expect(
    splitTrack.locator(".cell-dissent").filter({ hasText: "ranks B first" }),
  ).toHaveCount(2);

  const tiedSplitRow = page.locator(".panel", { hasText: "Two-review launch split" });
  await openSavedRun(tiedSplitRow, "Open saved run 108: Two-review launch split");
  const tiedTrack = await openCouncilMode(page);
  await expect(tiedTrack).toContainText("2 of 6 reviewer rankings entered");
  await expect(tiedTrack).toContainText("split rankings: 1 each for A and B");
  await expect(tiedTrack.locator(".cell-dissent")).toHaveCount(0);

  await page
    .getByRole("button", {
      name: "Open saved run 110: CLI-filed operations question",
      exact: true,
    })
    .click();
  await expect(page.locator(".docket-meta")).toContainText("CLI");
  await page
    .getByRole("button", {
      name: "Open saved run 111: API-filed product question",
      exact: true,
    })
    .click();
  await expect(page.locator(".docket-meta")).toContainText("API");

  await openSavedRun(completedRow, open102);
  await openRunAgainMode(page);
  await expect(page.getByText(/creates a new saved run/)).toBeVisible();
  await expect(page.getByText(/choose another council only if/)).toBeVisible();
  await expect(page.getByRole("radio", { name: "The Founding Council" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "The Lantern Council" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "The Commons Council" })).toBeChecked();
  await expect(page.getByText(/Choose a council before running again/)).toHaveCount(0);
  await expect(runAgainSubmitButton(page)).toBeEnabled();
  await page.getByLabel("Question for this run").fill("Reframed vendor selection question");
  await runAgainSubmitButton(page).dblclick();
  await expect(page.getByRole("button", { name: "Creating new run…" })).toBeDisabled();
  await expect.poll(() => state.rerunBodies.length).toBe(1);
  expect(state.rerunBodies[0]).toEqual({
    councilRef: builtInCommonsRef(),
    queryOverride: "Reframed vendor selection question",
  });
  await expect(page.getByText("New run created", { exact: true })).toBeVisible();

  const pendingRow = page.locator(".panel", { hasText: "Filed roadmap planning question" });
  await expect(pendingRow).toContainText("tokens pending");
  await expect(pendingRow).toContainText("cost pending");
  await expect(pendingRow).not.toContainText("0 tokens");
  await expect(pendingRow).not.toContainText("$0.000000");
  await expect(page.locator(".panel", { hasText: "Partial-cost answer" })).toContainText(
    "partial cost $0.000123",
  );
});

test("unchanged rerun omits query override", async ({ page }) => {
  const state = installApiMocks(page);
  await unlockByok(page);
  await page.getByRole("link", { name: "Archive" }).click();

  const completedRow = page.locator(".panel", { hasText: "Completed vendor selection question" });
  await openSavedRun(completedRow, open102);
  await openRunAgainMode(page);
  await runAgainSubmitButton(page).click();

  await expect.poll(() => state.rerunBodies.length).toBe(1);
  expect(state.rerunBodies[0]).toEqual({ councilRef: builtInCommonsRef() });
});

test("blank rerun question reuses the original question", async ({ page }) => {
  const state = installApiMocks(page);
  await unlockByok(page);
  await page.getByRole("link", { name: "Archive" }).click();

  const completedRow = page.locator(".panel", { hasText: "Completed vendor selection question" });
  await openSavedRun(completedRow, open102);
  await openRunAgainMode(page);
  await page.getByLabel("Question for this run").fill("   ");
  await expect(page.getByText("A blank question reuses the original question.")).toBeVisible();
  await runAgainSubmitButton(page).click();

  await expect.poll(() => state.rerunBodies.length).toBe(1);
  expect(state.rerunBodies[0]).toEqual({ councilRef: builtInCommonsRef() });
  await expect(page.getByLabel("Question for this run")).toHaveValue(
    "Completed vendor selection question",
  );
});

test("run details rail labels stay stable while diagnostics load", async ({ page }) => {
  installApiMocks(page);
  await page.route("**/api/v1/sessions/102/diagnostics", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fallback();
  });
  await unlockByok(page);
  await page.getByRole("link", { name: "Archive" }).click();

  const completedRow = page.locator(".panel", { hasText: "Completed vendor selection question" });
  await openSavedRun(completedRow, open102);
  const beforeLoading = await railGeometry(page);
  await page
    .locator(".manuscript-action-bar")
    .getByRole("button", { name: "Run details", exact: true })
    .click();

  await expect(
    page.locator(".manuscript-action-bar").getByRole("button", { name: "Run details" }),
  ).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".manuscript-action-bar").getByText("Loading details")).toHaveCount(0);
  expect(await railGeometry(page)).toEqual(beforeLoading);
  await expect(page.locator("#run-details-panel")).toContainText("accepted model outputs recorded");
});

test("run again defaults to a saved user council and allows an explicit council change", async ({
  page,
}) => {
  const state = installApiMocks(page);
  state.userCouncilExists = true;
  await unlockByok(page);
  await page.getByRole("link", { name: "Archive" }).click();

  const customCouncilRow = page.locator(".panel", { hasText: "Custom council vendor question" });
  await openSavedRun(customCouncilRow, "Open saved run 113: Custom council vendor question");
  await openRunAgainMode(page);
  await expect(page.getByRole("radio", { name: "Commons Copy" })).toBeChecked();
  await page.getByRole("radio", { name: "The Lantern Council" }).check();
  await runAgainSubmitButton(page).click();

  await expect.poll(() => state.rerunSessionIds).toEqual([113]);
  await expect.poll(() => state.rerunBodies.length).toBe(1);
  expect(state.rerunBodies[0]).toEqual({ councilRef: builtInLanternRef() });
});
