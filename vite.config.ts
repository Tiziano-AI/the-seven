import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { buildPathAliases } from "./config/aliases";

const plugins = [react(), tailwindcss()];
const rootDir = import.meta.dirname;

export default defineConfig({
  plugins,
  resolve: {
    alias: buildPathAliases(rootDir),
  },
  envDir: path.resolve(rootDir),
  root: path.resolve(rootDir, "client"),
  publicDir: path.resolve(rootDir, "client", "public"),
  build: {
    outDir: path.resolve(rootDir, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      allow: [path.resolve(rootDir, "shared")],
      deny: ["**/.*"],
    },
  },
});
