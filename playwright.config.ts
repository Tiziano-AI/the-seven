import { defineConfig } from "@playwright/test";
import { buildPlaywrightConfig } from "./tools/playwright-config";

export default defineConfig(buildPlaywrightConfig(process.env));
