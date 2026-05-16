import type { PlaywrightTestConfig } from "@playwright/test";
import { buildLocalNextDistDir } from "./local-http";
import { buildNextDevServerCommand } from "./next-dev";

function requireBaseUrl(env: NodeJS.ProcessEnv): string {
  const baseUrl = env.SEVEN_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("SEVEN_BASE_URL is required for Playwright browser proof.");
  }
  return new URL(baseUrl).toString().replace(/\/+$/, "");
}

function requireLocalPort(baseUrl: string): number {
  const parsed = new URL(baseUrl);
  if (!parsed.port) {
    throw new Error("SEVEN_BASE_URL must include a port when Playwright starts the web server.");
  }
  return Number.parseInt(parsed.port, 10);
}

function buildWebServerEnv(input: { env: NodeJS.ProcessEnv; port: number; baseUrl: string }) {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.env)) {
    if (typeof value === "string") {
      output[key] = value;
    }
  }
  output.PORT = String(input.port);
  output.SEVEN_BASE_URL = input.baseUrl;
  output.SEVEN_NEXT_DIST_DIR = buildLocalNextDistDir(input.port);
  return output;
}

/** Builds the Playwright config from the local HTTP projection. */
export function buildPlaywrightConfig(env: NodeJS.ProcessEnv): PlaywrightTestConfig {
  const baseURL = requireBaseUrl(env);
  const useExternalServer = env.SEVEN_PLAYWRIGHT_EXTERNAL_SERVER === "1";
  const command = buildNextDevServerCommand();
  const webServer = useExternalServer
    ? undefined
    : (() => {
        const port = requireLocalPort(baseURL);
        return {
          command: [command.command, ...command.args].join(" "),
          env: buildWebServerEnv({ env, port, baseUrl: baseURL }),
          gracefulShutdown: { signal: "SIGTERM" as const, timeout: 10_000 },
          url: baseURL,
          reuseExistingServer: false,
          timeout: 120_000,
        };
      })();

  const forbidOnly = env.CI === "1" ? true : env.SEVEN_PLAYWRIGHT_ALLOW_ONLY !== "1";

  return {
    testDir: "./apps/web/e2e",
    timeout: 60_000,
    workers: 1,
    forbidOnly,
    use: {
      baseURL,
      trace: "on-first-retry",
    },
    webServer,
  };
}
