import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

function resolveStaticDir(): string {
  const bundled = path.resolve(import.meta.dirname, "public");
  const rootDist = path.resolve(import.meta.dirname, "../..", "dist", "public");

  if (fs.existsSync(bundled)) return bundled;
  if (fs.existsSync(rootDist)) return rootDist;

  throw new Error(
    `Static build directory not found (checked "${bundled}" and "${rootDist}")`
  );
}

export async function setupVite(app: Express, server: Server) {
  const allowedHosts: true = true;
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use(/.*/, async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      const template = await fs.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (error: unknown) {
      const asError = error instanceof Error ? error : new Error("Vite middleware error");
      vite.ssrFixStacktrace(asError);
      next(asError);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = resolveStaticDir();
  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use(/.*/, (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
