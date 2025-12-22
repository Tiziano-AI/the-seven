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
          if (id.includes("react-dom") || id.includes("scheduler")) return "react-dom-vendor";
          if (id.includes("react")) return "react-vendor";
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
          if (id.includes("@radix-ui")) return "radix-vendor";
          if (id.includes("@tanstack")) return "query-vendor";
          if (id.includes("lucide-react")) return "icons-vendor";
          if (id.includes("date-fns")) return "date-vendor";
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
