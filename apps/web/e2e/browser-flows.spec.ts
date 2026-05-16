import { expect, test } from "@playwright/test";
import { unlockByok } from "./browser-flow-auth";
import { installDemoSessionMock } from "./browser-flow-demo-session";
import { builtInCommonsRef, installApiMocks, phasePrompts } from "./browser-flow-fixtures";

test("council duplicate, edit, save, and delete are browser-proven", async ({ page }) => {
  const state = installApiMocks(page);
  await unlockByok(page);
  await page.getByRole("link", { name: "Council Library" }).click();
  await expect(page.getByRole("heading", { name: "Council Library" })).toBeVisible();
  await page.getByRole("button", { name: /The Commons Council/ }).click();

  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect.poll(() => state.duplicateBodies.length).toBe(1);
  expect(state.duplicateBodies[0]).toEqual({
    source: builtInCommonsRef(),
    name: "The Commons Council Copy",
  });

  await expect(page.getByLabel("Name")).toHaveValue("Commons Copy");
  await page.getByLabel("Name").fill("Launch Council");
  await expect(page.locator("datalist")).toHaveCount(0);
  const firstSeat = page.locator(".role-card").first();
  await expect(firstSeat.locator(".model-selection-name")).toContainText("Qwen3.6 35B A3B");
  await expect(firstSeat.locator(".model-selection-id")).toContainText("qwen/qwen3.6-35b-a3b");
  await firstSeat.getByRole("button", { name: "Change Seat A model catalog" }).click();
  await firstSeat.getByRole("combobox", { name: "Search Seat A catalog" }).fill("claude");
  await firstSeat.getByRole("option", { name: /Claude Opus 4.7/ }).click();
  await expect(firstSeat.locator(".model-selection-name")).toContainText("Claude Opus 4.7");
  await expect(firstSeat.locator(".model-selection-id")).toContainText("anthropic/claude-opus-4.7");
  await firstSeat.getByRole("button", { name: /Tuning/ }).click();
  await expect(firstSeat.getByLabel("Temperature")).toHaveAttribute("inputmode", "decimal");
  await expect(firstSeat.getByLabel("Top P")).toHaveAttribute("inputmode", "decimal");
  await expect(firstSeat.getByLabel("Seed")).toHaveAttribute("inputmode", "numeric");
  await expect(firstSeat.getByRole("radio", { name: "Extra high" })).toBeVisible();
  await firstSeat.getByRole("radio", { name: "Suppress" }).check();
  await firstSeat.getByRole("button", { name: "Change Seat A model catalog" }).click();
  await firstSeat
    .getByRole("combobox", { name: "Search Seat A catalog" })
    .fill("proof/invalid-model");
  await firstSeat.getByRole("combobox", { name: "Search Seat A catalog" }).press("Enter");
  await expect(firstSeat.getByText("Not found in the current catalog.")).toBeVisible();
  await expect(page.locator(".alert-danger")).toContainText(
    "Resolve invalid model seats before saving.",
  );
  await page.getByRole("button", { name: "Seat A", exact: true }).click();
  await expect(
    firstSeat.getByRole("button", { name: "Change Seat A model catalog" }),
  ).toBeFocused();
  await firstSeat.getByRole("button", { name: "Change Seat A model catalog" }).click();
  await firstSeat.getByRole("combobox", { name: "Search Seat A catalog" }).fill("no tuning");
  await expect(firstSeat.getByRole("option", { name: /No Tuning Model/ })).toBeVisible();
  await firstSeat.getByRole("combobox", { name: "Search Seat A catalog" }).press("ArrowDown");
  await firstSeat.getByRole("combobox", { name: "Search Seat A catalog" }).press("Enter");
  await expect(firstSeat.getByText("0 supported parameters")).toBeVisible();
  await expect(firstSeat.getByText("no editable tuning controls")).toBeVisible();
  await expect(firstSeat.getByLabel("Temperature")).toHaveCount(0);
  await expect(firstSeat.getByLabel("Top P")).toHaveCount(0);
  await expect(firstSeat.getByLabel("Seed")).toHaveCount(0);
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => state.saveBodies.length).toBe(1);
  expect(state.saveBodies[0]).toMatchObject({
    name: "Launch Council",
    phasePrompts: phasePrompts(),
  });
  expect((state.saveBodies[0] as { members: unknown[] }).members[0]).toMatchObject({
    model: { modelId: "proof/no-tuning-model" },
    tuning: expect.objectContaining({
      temperature: null,
      topP: null,
      seed: null,
      includeReasoning: null,
    }),
  });

  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete council" }).click();
  await expect.poll(() => state.deleteCount).toBe(1);
});

test("session detail deep link renders the full archived verdict", async ({ context, page }) => {
  installApiMocks(page);
  await installDemoSessionMock(context, page);

  await page.goto("/sessions/102");
  await expect(
    page.locator(".docket-question").getByText("Completed petition on guild tolls"),
  ).toBeVisible();
  const track = page.getByRole("region", { name: "Council proceedings" });
  await expect(track.locator(".cell")).toHaveCount(7);
  await expect(track).toContainText("All 6 reviewer rankings point to F");

  await page.getByRole("button", { name: "Open Proceedings", exact: true }).click();
  await expect(page.locator("#proceedings-phase2-A")).toContainText("Major disagreements");
  await page.getByRole("button", { name: "Provider Record" }).click();
  const providerLedger = page.locator("#provider-record-panel");
  await expect(
    providerLedger.locator(".diagnostic-card").filter({ hasText: "A · Reviewer" }),
  ).toContainText("max output 8192");
  await expect(
    providerLedger.locator(".diagnostic-card").filter({ hasText: "C · Reviewer" }),
  ).toContainText("denied response_format, structured_outputs");
  await page.getByRole("button", { name: "Prepare rerun" }).click();
  await expect(page.getByText("Rerun Matter")).toBeVisible();
});
