import { defineConfig } from "vitest/config";
import path from "path";
import { buildPathAliases } from "./config/aliases";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: buildPathAliases(templateRoot),
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
  },
});
