import { readFile } from "node:fs/promises";
import { type Download, expect, test } from "@playwright/test";
import { unlockByok } from "./browser-flow-auth";
import { builtInCommonsRef, installApiMocks } from "./browser-flow-fixtures";

test("created run can be answered, exported, archived, reopened, and run again", async ({
  context,
  page,
}) => {
  const state = installApiMocks(page);
  await unlockByok(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });

  await page.getByRole("radio", { name: /The Commons Council/ }).check();
  await page.getByLabel("Question").fill("Question with evidence");
  await page.getByRole("button", { name: "Ask the council" }).click();

  await expect.poll(() => state.createSessionBodies.length).toBe(1);
  expect(state.createSessionBodies[0]).toEqual({
    query: "Question with evidence",
    councilRef: builtInCommonsRef(),
    attachments: [],
  });
  await expect(page.getByText("Ready for another question")).toBeVisible();
  await expect(page.locator(".docket-question").getByText("Question with evidence")).toBeVisible();

  const exportedDownloads: Download[] = [];
  page.on("download", (download) => {
    exportedDownloads.push(download);
  });
  await page
    .locator(".manuscript-action-bar")
    .getByRole("button", { name: "Exports", exact: true })
    .click();
  await page.getByRole("button", { name: "Copy answer", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("Final answer: approve the vendor plan");
  await page.getByRole("button", { name: "Copy private link" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("/sessions/77");
  await page.getByRole("button", { name: "Download answer" }).click();
  await expect
    .poll(() => exportedDownloads.map((download) => download.suggestedFilename()))
    .toContain("answer-77.md");
  await expect(page.getByRole("button", { name: "Download full record" })).toBeEnabled();
  await page.getByRole("button", { name: "Download full record" }).click();
  await expect
    .poll(() => exportedDownloads.map((download) => download.suggestedFilename()).sort())
    .toEqual(["answer-77.md", "full-record-77.json"]);

  const answerMarkdownDownload = exportedDownloads.find(
    (download) => download.suggestedFilename() === "answer-77.md",
  );
  const fullRecordDownload = exportedDownloads.find(
    (download) => download.suggestedFilename() === "full-record-77.json",
  );
  if (!answerMarkdownDownload || !fullRecordDownload) {
    throw new Error("Created run export did not emit answer and full-record downloads.");
  }
  const answerMarkdownPath = await answerMarkdownDownload.path();
  const fullRecordPath = await fullRecordDownload.path();
  if (!answerMarkdownPath || !fullRecordPath) {
    throw new Error("Created run export downloads were not materialized to disk.");
  }
  await expect.poll(() => readFile(answerMarkdownPath, "utf8")).toContain("# Answer 77");
  await expect.poll(() => readFile(fullRecordPath, "utf8")).toBe('{"ok":true}');
  expect(state.exportBodies[0]).toEqual({ sessionIds: [77] });

  await page.getByRole("link", { name: "Archive" }).click();
  const createdRow = page.locator(".archive-row", { hasText: "Question with evidence" });
  await expect(createdRow).toBeVisible();
  await createdRow
    .getByRole("button", { name: "Open saved run 77: Question with evidence", exact: true })
    .click();
  await expect(page.locator(".docket-question").getByText("Question with evidence")).toBeVisible();
  await page
    .locator(".manuscript-action-bar")
    .getByRole("button", { name: "Run again", exact: true })
    .click();
  await page.locator("#rerun-docket").getByRole("button", { name: "Run again" }).click();

  await expect.poll(() => state.rerunSessionIds).toEqual([77]);
  expect(state.rerunBodies[0]).toEqual({ councilRef: builtInCommonsRef() });
});
