import { expect, test } from "@playwright/test";
import { unlockByok } from "./browser-flow-auth";
import { installApiMocks } from "./browser-flow-fixtures";

test("denied manuscript load keeps the archive row selected with recovery controls", async ({
  page,
}) => {
  installApiMocks(page);
  await unlockByok(page);
  await page.getByRole("link", { name: "Archive" }).click();

  const completedRow = page.locator(".panel", { hasText: "Completed petition on guild tolls" });
  await completedRow
    .getByRole("button", {
      name: "Open manuscript for matter 102: Completed petition on guild tolls",
      exact: true,
    })
    .click();
  await expect(
    page.locator(".docket-question").getByText("Completed petition on guild tolls"),
  ).toBeVisible();

  const deniedRow = page.locator(".panel", { hasText: "Sealed denied manuscript" });
  await deniedRow
    .getByRole("button", {
      name: "Open manuscript for matter 109: Sealed denied manuscript",
      exact: true,
    })
    .click();
  await expect(page.getByText("Manuscript could not load.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry manuscript load" })).toBeVisible();
  await expect(deniedRow).toHaveClass(/archive-row-active/u);
  await expect(page.locator(".docket-question")).toHaveCount(0);
});
