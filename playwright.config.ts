import { defineConfig } from "@playwright/test";

const baseURL = process.env.SEVEN_BASE_URL ?? "http://127.0.0.1:3000";
const useExternalServer = process.env.SEVEN_PLAYWRIGHT_EXTERNAL_SERVER === "1";
const baseUrlPort = new URL(baseURL).port || "3000";

export default defineConfig({
  testDir: "./apps/web/e2e",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: useExternalServer
    ? undefined
    : {
        command: `pnpm --filter @the-seven/web exec next dev --hostname 127.0.0.1 --port ${baseUrlPort}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
