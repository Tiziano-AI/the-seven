import { readFile } from "node:fs/promises";
import { type Download, expect, test } from "@playwright/test";
import { unlockByok } from "./browser-flow-auth";
import { builtInCommonsRef, installApiMocks } from "./browser-flow-fixtures";

const open102 = "Open manuscript for matter 102: Completed petition on guild tolls";

test("sessions search, select, export, continue, and rerun are browser-proven", async ({
  page,
}) => {
  const state = installApiMocks(page);
  await unlockByok(page);
  await page.getByRole("link", { name: "Archive" }).click();

  await expect(
    page.locator(".panel", { hasText: "Recover interrupted chancery petition" }),
  ).toBeVisible();
  await expect(
    page.locator(".panel", { hasText: "Completed petition on guild tolls" }),
  ).toBeVisible();
  await expect(
    page.getByText("Select an archived matter to inspect its manuscript."),
  ).toBeVisible();
  await expect(page.locator(".docket-question")).toHaveCount(0);

  await page.getByLabel("Search archive").fill("Recover");
  await expect(
    page.locator(".panel", { hasText: "Recover interrupted chancery petition" }),
  ).toBeVisible();
  await expect(
    page.locator(".panel", { hasText: "Completed petition on guild tolls" }),
  ).toBeHidden();
  await page.getByLabel("Search archive").fill("");
  const track = page.getByRole("region", { name: "Council proceedings" });

  const failedRow = page.locator(".panel", { hasText: "Recover interrupted chancery petition" });
  await failedRow.getByRole("button", { name: /Add matter 101 to dossier/u }).click();
  const exportedDownloads: Download[] = [];
  page.on("download", (download) => {
    exportedDownloads.push(download);
  });
  await page
    .locator(".archive-grid > .card")
    .first()
    .getByRole("button", { name: "Export Dossier" })
    .click();
  await expect
    .poll(() => exportedDownloads.map((download) => download.suggestedFilename()).sort())
    .toEqual(["dossier.json", "dossier.md"]);
  const markdownDownload = exportedDownloads.find(
    (download) => download.suggestedFilename() === "dossier.md",
  );
  const jsonDownload = exportedDownloads.find(
    (download) => download.suggestedFilename() === "dossier.json",
  );
  if (!markdownDownload || !jsonDownload) {
    throw new Error("Archive export did not emit both dossier downloads.");
  }
  const markdownPath = await markdownDownload.path();
  const jsonPath = await jsonDownload.path();
  if (!markdownPath || !jsonPath) {
    throw new Error("Archive export downloads were not materialized to disk.");
  }
  await expect.poll(() => readFile(markdownPath, "utf8")).toBe("# Manuscript 101");
  await expect.poll(() => readFile(jsonPath, "utf8")).toBe('{"ok":true}');
  await expect.poll(() => state.exportBodies.length).toBe(1);
  expect(state.exportBodies[0]).toEqual({ sessionIds: [101] });

  await failedRow.getByRole("button", { name: /Open recovery for matter 101/u }).click();
  await expect(page.getByRole("heading", { name: "Recovery record" })).toBeVisible();
  await expect(page.locator(".recovery-grid dd", { hasText: "Critique phase failed" })).toHaveText(
    "Critique phase failed",
  );
  await expect(
    page.locator(".recovery-grid dd", { hasText: "Server terminal note from the failed job" }),
  ).toContainText("Provider Record");
  await expect(
    page.locator(".recovery-grid dd", { hasText: "OpenRouter request failed" }),
  ).toContainText("rate-limit response");
  await expect(page.getByText("No artifacts were preserved before failure.")).toBeVisible();
  await expect(page.getByText(/original run snapshot/)).toBeVisible();
  await expect(page.getByText(/freshly chosen council/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue this run" })).toBeVisible();
  await expect(track).not.toContainText("deliberating");
  const continueResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/sessions/101/continue"),
  );
  await page.getByRole("button", { name: "Continue this run" }).click();
  await expect(page.getByRole("button", { name: "Continuing…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Prepare rerun" })).toBeDisabled();
  await continueResponse;
  await expect.poll(() => state.continueSessionIds).toEqual([101]);

  const completedRow = page.locator(".panel", { hasText: "Completed petition on guild tolls" });
  await completedRow
    .getByRole("button", {
      name: open102,
      exact: true,
    })
    .click();
  await expect(
    page.locator(".docket-question").getByText("Completed petition on guild tolls"),
  ).toBeVisible();
  await expect(page.locator(".docket-meta")).toContainText("Web petition");
  await expect(track.locator(".cell")).toHaveCount(7);
  await expect(track.locator("#cand-A .cell-label")).toHaveText("Qwen3.6 35B A3B");
  await expect(track.locator("#cand-A .cell-model")).toHaveText("qwen/qwen3.6-35b-a3b");
  await expect(track.locator("#cand-A .cell-model")).toHaveAttribute(
    "title",
    "qwen/qwen3.6-35b-a3b",
  );
  await expect(track).toContainText("All 6 reviewer rankings point to F");
  await expect(track.locator("#cand-G")).toContainText("verdict entered");
  await expect(page.getByText(/Synthesizer G weighs cited evidence/)).toBeVisible();
  const manuscriptDownloadStart = exportedDownloads.length;
  await page
    .locator(".manuscript-action-bar")
    .getByRole("button", { name: "Export Dossier" })
    .click();
  await expect
    .poll(() =>
      exportedDownloads
        .slice(manuscriptDownloadStart)
        .map((download) => download.suggestedFilename())
        .sort(),
    )
    .toEqual(["manuscript-102.json", "manuscript-102.md"]);
  const manuscriptMarkdownDownload = exportedDownloads.find(
    (download) => download.suggestedFilename() === "manuscript-102.md",
  );
  const manuscriptJsonDownload = exportedDownloads.find(
    (download) => download.suggestedFilename() === "manuscript-102.json",
  );
  if (!manuscriptMarkdownDownload || !manuscriptJsonDownload) {
    throw new Error("Manuscript export did not emit both downloads.");
  }
  const manuscriptMarkdownPath = await manuscriptMarkdownDownload.path();
  const manuscriptJsonPath = await manuscriptJsonDownload.path();
  if (!manuscriptMarkdownPath || !manuscriptJsonPath) {
    throw new Error("Manuscript export downloads were not materialized to disk.");
  }
  await expect.poll(() => readFile(manuscriptMarkdownPath, "utf8")).toBe("# Manuscript 102");
  await expect.poll(() => readFile(manuscriptJsonPath, "utf8")).toBe('{"ok":true}');
  await expect.poll(() => state.exportBodies.length).toBe(2);
  expect(state.exportBodies[1]).toEqual({ sessionIds: [102] });
  await page.locator('.chip[data-chip-target="proceedings-phase1-A"]').click();
  await expect(page.locator("#proceedings-phase1-A")).toBeInViewport();
  await page.getByRole("button", { name: "R1" }).click();
  await expect(page.locator("#proceedings-phase2-A")).toBeInViewport();
  await expect(page.locator("#proceedings-phase2-A")).toContainText("score 100");
  await expect(page.locator("#proceedings-phase2-A")).toContainText("Strengths");
  await expect(page.locator("#proceedings-phase2-A")).toContainText("Weaknesses");
  await expect(page.locator("#proceedings-phase2-A")).toContainText("Critical errors");
  await expect(page.locator("#proceedings-phase2-A")).toContainText("Missing evidence");
  await expect(page.locator("#proceedings-phase2-A")).toContainText("Verdict input");
  await expect(page.locator("#proceedings-phase2-A")).toContainText("Best final-answer inputs");
  await expect(page.locator("#proceedings-phase2-A")).toContainText("Major disagreements");
  await page.getByRole("button", { name: "Provider Record" }).click();
  await expect(page.locator("#provider-record-panel")).toBeInViewport();
  const providerLedger = page.getByRole("list", { name: "Provider diagnostics" });
  const successfulCall = providerLedger
    .locator(".diagnostic-card")
    .filter({ hasText: "A · Reviewer" });
  await expect(successfulCall.locator(".diagnostic-seat")).not.toHaveText("1");
  await expect(successfulCall).toContainText("Phase 1");
  await expect(successfulCall).toContainText("Qwen3.6 35B A3B");
  await expect(successfulCall).toContainText("qwen/qwen3.6-35b-a3b");
  await expect(successfulCall).toContainText("max output 8192");
  await expect(successfulCall).toContainText("reasoning effort low");
  await expect(successfulCall).toContainText("sent max_tokens, reasoning");
  await expect(successfulCall).toContainText(
    "supported max_tokens, reasoning, response_format, structured_outputs",
  );
  await expect(successfulCall).toContainText("denied none");
  await expect(successfulCall).toContainText("require params yes");
  await expect(successfulCall).toContainText("ignored amazon-bedrock, azure");
  await expect(successfulCall).toContainText("response qwen/qwen3.6-35b-a3b");
  await expect(successfulCall).toContainText("billed qwen/qwen3.6-35b-a3b");
  await expect(successfulCall).toContainText("tokens 42");
  await expect(successfulCall).toContainText("latency 1200 ms");
  await expect(successfulCall).toContainText("cost $0.000123");
  await expect(successfulCall).toContainText("finish stop");
  await expect(successfulCall).toContainText("billing succeeded");
  await expect(successfulCall).toContainText("id generation-proof");
  await expect(successfulCall).toContainText("status none");
  await expect(successfulCall).toContainText("code none");
  await expect(page.locator("#provider-record-panel")).toContainText(
    "2 accepted provider outputs recorded. 2 failed or denied attempts need attention and are receipts, not accepted verdict evidence. 1 billing settlement remains unsettled; cost evidence is not final.",
  );
  const phaseTwoCall = providerLedger
    .locator(".diagnostic-card")
    .filter({ hasText: "B · Reviewer" });
  await expect(phaseTwoCall).toContainText("Phase 2");
  await expect(phaseTwoCall).toContainText("Settlement pending");
  await expect(phaseTwoCall).toContainText("max output 16384");
  await expect(phaseTwoCall).toContainText("reasoning effort low");
  await expect(phaseTwoCall).toContainText("sent max_tokens, reasoning, response_format");
  await expect(phaseTwoCall).toContainText(
    "supported max_tokens, reasoning, response_format, structured_outputs",
  );
  await expect(phaseTwoCall).toContainText("denied none");
  await expect(phaseTwoCall).toContainText("cost n/a");
  await expect(phaseTwoCall).toContainText("billing pending");

  const deniedCall = providerLedger.locator(".diagnostic-card").filter({ hasText: "C · Reviewer" });
  await expect(deniedCall).toContainText("Phase 2 · Needs attention");
  await expect(deniedCall).toContainText("max output not sent");
  await expect(deniedCall).toContainText("reasoning effort not sent");
  await expect(deniedCall).toContainText("sent none");
  await expect(deniedCall).toContainText("supported max_tokens");
  await expect(deniedCall).toContainText("denied response_format, structured_outputs");
  await expect(deniedCall).toContainText("require params no");
  await expect(deniedCall).toContainText("ignored none");
  await expect(deniedCall).toContainText("billing not requested");
  await expect(deniedCall).toContainText("status none");
  await expect(deniedCall).toContainText("code none");

  const upstreamCall = providerLedger
    .locator(".diagnostic-card")
    .filter({ hasText: "D · Reviewer" });
  await expect(upstreamCall).toContainText("Phase 1 · Needs attention");
  await expect(upstreamCall).toContainText("max output 8192");
  await expect(upstreamCall).toContainText("reasoning effort low");
  await expect(upstreamCall).toContainText("sent max_tokens, reasoning");
  await expect(upstreamCall).toContainText("denied none");
  await expect(upstreamCall).toContainText("ignored amazon-bedrock, azure");
  await expect(upstreamCall).toContainText("response not returned");
  await expect(upstreamCall).toContainText("billed not settled");
  await expect(upstreamCall).toContainText("billing not requested");
  await expect(upstreamCall).toContainText("OpenRouter request failed (status 429): rate limited");
  await expect(upstreamCall).toContainText("status 429");
  await expect(upstreamCall).toContainText("code rate_limited");

  const noVotesRow = page.locator(".panel", { hasText: "Awaiting first scholia docket" });
  await noVotesRow
    .getByRole("button", {
      name: "Open manuscript for matter 105: Awaiting first scholia docket",
      exact: true,
    })
    .click();
  await expect(track).toContainText("Reviewers convening");

  const oneVoteRow = page.locator(".panel", { hasText: "Single-review manor dispute" });
  await oneVoteRow
    .getByRole("button", {
      name: "Open manuscript for matter 106: Single-review manor dispute",
      exact: true,
    })
    .click();
  await expect(track).toContainText("1 of 6 reviewer rankings entered");
  await expect(track).toContainText("strongest signal A");

  await page
    .getByRole("button", {
      name: "Open manuscript for matter 107: Split testimony on harbor dues",
      exact: true,
    })
    .click();
  await expect(track).toContainText("4 reviewer rankings point to A");
  await expect(track).toContainText("2 dissenting rankings");
  await expect(track.locator(".cell-dissent").filter({ hasText: "ranks B first" })).toHaveCount(2);

  const tiedSplitRow = page.locator(".panel", { hasText: "Two-review charter split" });
  await tiedSplitRow
    .getByRole("button", {
      name: "Open manuscript for matter 108: Two-review charter split",
      exact: true,
    })
    .click();
  await expect(track).toContainText("2 of 6 reviewer rankings entered");
  await expect(track).toContainText("split rankings: 1 each for A and B");
  await expect(track.locator(".cell-dissent")).toHaveCount(0);

  await page
    .getByRole("button", {
      name: "Open manuscript for matter 110: CLI-filed borough petition",
      exact: true,
    })
    .click();
  await expect(page.locator(".docket-meta")).toContainText("CLI petition");
  await page
    .getByRole("button", {
      name: "Open manuscript for matter 111: API-filed abbey petition",
      exact: true,
    })
    .click();
  await expect(page.locator(".docket-meta")).toContainText("API petition");

  await completedRow.getByRole("button", { name: /Open rerun docket for matter 102/u }).click();
  await expect(page.getByText("Rerun Matter")).toBeVisible();
  await expect(page.getByText(/creates a new archived run/)).toBeVisible();
  await expect(page.getByText(/starts a new seven-seat deliberation/)).toBeVisible();
  await expect(page.getByRole("radio", { name: "The Founding Council" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "The Lantern Council" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "The Commons Council" })).not.toBeChecked();
  await expect(page.getByText(/choose the council explicitly/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Run again" })).toBeDisabled();
  await page.getByRole("radio", { name: "The Commons Council" }).check();
  await page.getByLabel("Rerun Matter").fill("Reframed petition on guild tolls");
  await page.getByRole("button", { name: "Run again" }).dblclick();
  await expect(page.getByRole("button", { name: "Creating rerun…" })).toBeDisabled();
  await expect.poll(() => state.rerunBodies.length).toBe(1);
  expect(state.rerunBodies[0]).toEqual({
    councilRef: builtInCommonsRef(),
    queryOverride: "Reframed petition on guild tolls",
  });
  await expect(page.getByText("New run created", { exact: true })).toBeVisible();

  const pendingRow = page.locator(".panel", { hasText: "Filed abbey archive question" });
  await expect(pendingRow).toContainText("tokens pending");
  await expect(pendingRow).toContainText("cost pending");
  await expect(pendingRow).not.toContainText("0 tokens");
  await expect(pendingRow).not.toContainText("$0.000000");
  await expect(page.locator(".panel", { hasText: "Partial-cost abbey verdict" })).toContainText(
    "partial cost $0.000123",
  );
});

test("unchanged rerun omits query override", async ({ page }) => {
  const state = installApiMocks(page);
  await unlockByok(page);
  await page.getByRole("link", { name: "Archive" }).click();

  const completedRow = page.locator(".panel", { hasText: "Completed petition on guild tolls" });
  await completedRow
    .getByRole("button", {
      name: open102,
      exact: true,
    })
    .click();
  await completedRow.getByRole("button", { name: /Open rerun docket for matter 102/u }).click();
  await page.getByRole("radio", { name: "The Commons Council" }).check();
  await page.getByRole("button", { name: "Run again" }).click();

  await expect.poll(() => state.rerunBodies.length).toBe(1);
  expect(state.rerunBodies[0]).toEqual({ councilRef: builtInCommonsRef() });
});

test("blank rerun matter reuses the original docket matter", async ({ page }) => {
  const state = installApiMocks(page);
  await unlockByok(page);
  await page.getByRole("link", { name: "Archive" }).click();

  const completedRow = page.locator(".panel", { hasText: "Completed petition on guild tolls" });
  await completedRow
    .getByRole("button", {
      name: open102,
      exact: true,
    })
    .click();
  await completedRow.getByRole("button", { name: /Open rerun docket for matter 102/u }).click();
  await page.getByRole("radio", { name: "The Commons Council" }).check();
  await page.getByLabel("Rerun Matter").fill("   ");
  await expect(
    page.getByText("Blank rerun matter reuses the original docket matter."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run again" }).click();

  await expect.poll(() => state.rerunBodies.length).toBe(1);
  expect(state.rerunBodies[0]).toEqual({ councilRef: builtInCommonsRef() });
  await expect(page.getByLabel("Rerun Matter")).toHaveValue("Completed petition on guild tolls");
});
