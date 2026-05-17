import { expect, test } from "@playwright/test";
import { unlockByok } from "./browser-flow-auth";
import { installApiMocks } from "./browser-flow-fixtures";

test("denied run load keeps the archive row selected with retry controls", async ({ page }) => {
  installApiMocks(page);
  await unlockByok(page);
  await page.getByRole("link", { name: "Archive" }).click();

  const completedRow = page.locator(".panel", { hasText: "Completed vendor selection question" });
  await completedRow
    .getByRole("button", {
      name: "Open saved run 102: Completed vendor selection question",
      exact: true,
    })
    .click();
  await expect(
    page.locator(".docket-question").getByText("Completed vendor selection question"),
  ).toBeVisible();

  const deniedRow = page.locator(".panel", { hasText: "Denied saved run" });
  await deniedRow
    .getByRole("button", {
      name: "Open saved run 109: Denied saved run",
      exact: true,
    })
    .click();
  await expect(page.getByText("Saved run could not load.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry run load" })).toBeVisible();
  await expect(deniedRow).toHaveClass(/archive-row-active/u);
  await expect(page.locator(".docket-question")).toHaveCount(0);
});
