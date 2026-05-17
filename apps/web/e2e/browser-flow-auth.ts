import { expect, type Page } from "@playwright/test";
import { proofByokKey } from "./browser-flow-http";

/** Opens the locked workbench and completes the OpenRouter-key unlock path for browser-flow tests. */
export async function unlockByok(page: Page, options?: Readonly<{ submitTwice?: boolean }>) {
  await page.addInitScript(() => {
    window.localStorage.removeItem("seven.encrypted_api_key");
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Use your OpenRouter key/u }).click();
  await page.getByLabel("OpenRouter API key").fill(proofByokKey);
  await page.getByLabel("Local Password").fill("browser-proof-password");
  await expect(page.getByRole("button", { name: "Save and unlock key" })).toBeEnabled();
  if (options?.submitTwice) {
    await page.getByRole("button", { name: "Save and unlock key" }).dblclick();
  } else {
    await page.getByRole("button", { name: "Save and unlock key" }).click();
  }
  await expect(page.getByText("OpenRouter key unlocked", { exact: true })).toBeVisible();
}
