import { describe, expect, test } from "vitest";
import { buildPlaywrightConfig } from "./playwright-config";

describe("Playwright config projection", () => {
  test("uses the projected base URL and port", () => {
    const config = buildPlaywrightConfig({
      NODE_ENV: "test",
      SEVEN_BASE_URL: "http://127.0.0.1:43217",
      CI: "1",
    });

    expect(config.use?.baseURL).toBe("http://127.0.0.1:43217");
    expect(config.webServer).toMatchObject({
      command: "node --import tsx tools/next-dev-server.ts",
      env: {
        PORT: "43217",
        SEVEN_BASE_URL: "http://127.0.0.1:43217",
        SEVEN_NEXT_DIST_DIR: ".next-local/43217",
      },
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
      url: "http://127.0.0.1:43217",
      reuseExistingServer: false,
    });
  });

  test("does not start a web server in external-server mode", () => {
    const config = buildPlaywrightConfig({
      NODE_ENV: "test",
      SEVEN_BASE_URL: "https://theseven.ai",
      SEVEN_PLAYWRIGHT_EXTERNAL_SERVER: "1",
    });

    expect(config.use?.baseURL).toBe("https://theseven.ai");
    expect(config.webServer).toBeUndefined();
  });

  test("fails closed when the base URL is missing", () => {
    expect(() => buildPlaywrightConfig({ NODE_ENV: "test" })).toThrow("SEVEN_BASE_URL is required");
  });
});
