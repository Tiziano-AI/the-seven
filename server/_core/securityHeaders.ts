import type { Response } from "express";
import type { NodeEnv } from "./runtimeConfig";

function buildContentSecurityPolicy(nodeEnv: NodeEnv): string {
  const scriptSrc =
    nodeEnv === "development"
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
      : "script-src 'self' https://static.cloudflareinsights.com 'unsafe-inline'; ";

  const connectSrc =
    nodeEnv === "development"
      ? "connect-src 'self' ws: wss:; "
      : "connect-src 'self' https://cloudflareinsights.com; ";

  return (
    "default-src 'self'; " +
    scriptSrc +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    connectSrc +
    "img-src 'self' data: https:; " +
    "frame-ancestors 'none';"
  );
}

export function applySecurityHeaders(res: Response, nodeEnv: NodeEnv): void {
  res.setHeader("Content-Security-Policy", buildContentSecurityPolicy(nodeEnv));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}
