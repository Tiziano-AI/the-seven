import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { MAX_HTTP_JSON_BYTES } from "../domain/httpLimits";
import { errorToLogFields, log } from "./log";
import { requireServerRuntimeConfig } from "./runtimeConfig";
import { applySecurityHeaders } from "./securityHeaders";
import { serveStatic, setupVite } from "./vite";
import { loadPromptsConfig } from "../config";
import { reconcileNonTerminalSessionsToFailed } from "../stores/sessionStore";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const runtime = requireServerRuntimeConfig();
  log("info", "sqlite_path_selected", {
    sqlite_path: runtime.sqlite.path,
  });
  // Fail fast on invalid repo configuration before serving.
  loadPromptsConfig();

  const reconciliation = await reconcileNonTerminalSessionsToFailed();
  if (reconciliation.pendingCount + reconciliation.processingCount > 0) {
    log("warn", "sessions_reconciled_to_failed", {
      pending: reconciliation.pendingCount,
      processing: reconciliation.processingCount,
    });
  } else {
    log("info", "sessions_reconciled_to_failed", { pending: 0, processing: 0 });
  }

  const app = express();
  const server = createServer(app);
  
  // Security headers middleware (CSP for XSS protection)
  app.use((_req, res, next) => {
    applySecurityHeaders(res, runtime.nodeEnv);
    next();
  });
  
  // Configure body parser with a bounded limit for JSON ingress.
  app.use(express.json({ limit: MAX_HTTP_JSON_BYTES }));
  app.use(express.urlencoded({ limit: MAX_HTTP_JSON_BYTES, extended: true }));
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (runtime.nodeEnv === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = runtime.preferredPort;
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    log("warn", "port_unavailable_using_fallback", {
      preferred_port: preferredPort,
      selected_port: port,
    });
  }

  server.listen(port, () => {
    log("info", "server_listening", {
      host: "localhost",
      port,
    });
  });
}

startServer().catch((error: unknown) => {
  log("error", "server_start_failed", errorToLogFields(error));
  process.exitCode = 1;
});
