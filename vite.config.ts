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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            id.includes("react-markdown") ||
            id.includes("remark") ||
            id.includes("rehype") ||
            id.includes("hast") ||
            id.includes("mdast") ||
            id.includes("micromark")
          ) {
            return "markdown-vendor";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      allow: [path.resolve(rootDir, "shared")],
      deny: ["**/.*"],
    },
  },
});
