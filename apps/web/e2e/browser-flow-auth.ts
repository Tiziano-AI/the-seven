import { expect, type Page } from "@playwright/test";
import { proofByokKey } from "./browser-flow-http";

/** Opens the locked workbench and completes the BYOK unlock path for browser-flow tests. */
export async function unlockByok(page: Page, options?: Readonly<{ submitTwice?: boolean }>) {
  await page.addInitScript(() => {
    window.localStorage.removeItem("seven.encrypted_api_key");
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Bring Your Own Key" }).click();
  await page.getByLabel("OpenRouter API Key").fill(proofByokKey);
  await page.getByLabel("Local Password").fill("browser-proof-password");
  await expect(page.getByRole("button", { name: "Validate and Unlock" })).toBeEnabled();
  if (options?.submitTwice) {
    await page.getByRole("button", { name: "Validate and Unlock" }).dblclick();
  } else {
    await page.getByRole("button", { name: "Validate and Unlock" }).click();
  }
  await expect(page.getByText("BYOK key admitted", { exact: true })).toBeVisible();
}
