import { expect, type Locator, type Page } from "@playwright/test";

export const open102 = "Open saved run 102: Completed vendor selection question";

/** Opens an Archive row through its row-owned select/open button. */
export async function openSavedRun(row: Locator, label: string) {
  await row.getByRole("button", { name: label, exact: true }).click();
}

/** Opens the inspector Council mode and returns the Council region. */
export async function openCouncilMode(page: Page) {
  await page
    .locator(".manuscript-action-bar")
    .getByRole("button", { name: "Council", exact: true })
    .click();
  return page.getByRole("region", { name: "Council" });
}

/** Opens Run details and returns the diagnostic card list. */
export async function openRunDetailsMode(page: Page) {
  await page
    .locator(".manuscript-action-bar")
    .getByRole("button", { name: "Run details", exact: true })
    .click();
  await expect(page.locator("#run-details-panel")).toBeVisible();
  return page.getByRole("list", { name: "Run details" });
}

/** Opens the Run again panel and waits for its editable question field. */
export async function openRunAgainMode(page: Page) {
  await page
    .locator(".manuscript-action-bar")
    .getByRole("button", { name: "Run again", exact: true })
    .click();
  await expect(page.getByLabel("Question for this run")).toBeVisible();
}

/** Locates the stable Run again submit button inside the rerun panel. */
export function runAgainSubmitButton(page: Page) {
  return page.locator("#rerun-docket").getByRole("button", { name: "Run again", exact: true });
}

/** Proves provider-call diagnostic details use normal-user labels without hiding receipts. */
export async function expectRunDetailsLedger(page: Page) {
  const providerLedger = await openRunDetailsMode(page);
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
  await expect(page.locator("#run-details-panel")).toContainText(
    "2 accepted model outputs recorded. 2 failed or denied attempts need attention and are receipts, not accepted answer evidence. 1 billing settlement remains unsettled; cost evidence is not final.",
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
}
