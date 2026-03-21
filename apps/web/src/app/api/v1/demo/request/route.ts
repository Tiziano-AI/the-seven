import { loadServerEnv } from "@the-seven/config";
import { demoRequestBodySchema } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { EdgeError } from "@/server/http/errors";
import { parseJsonBody } from "@/server/http/parse";
import { handleRoute } from "@/server/http/route";
import { DemoAuthError, requestDemoAuthLink } from "@/server/services/demoAuth";
import { previewDemoEmailRequestLimit, recordDemoEmailRequest } from "@/server/services/demoLimits";

export async function POST(request: NextRequest) {
  return handleRoute(request, {
    resource: "demo.request",
    handler: async (ctx, rawRequest) => {
      const input = await parseJsonBody(rawRequest, demoRequestBodySchema);
      const email = input.email.trim().toLowerCase();
      const env = loadServerEnv();

      if (!env.demo.enabled) {
        throw new EdgeError({
          kind: "forbidden",
          message: "Demo mode is disabled",
          details: { reason: "demo_disabled" },
          status: 403,
        });
      }

      const limited = await previewDemoEmailRequestLimit({
        email,
        ip: ctx.ip,
        now: ctx.now,
      });
      if (limited) {
        throw new EdgeError({
          kind: "rate_limited",
          message: "Demo email rate limit exceeded",
          details: {
            scope: limited.scope,
            limit: limited.limit,
            windowSeconds: limited.windowSeconds,
            resetAt: new Date(limited.resetAtMs).toISOString(),
          },
          status: 429,
        });
      }

      try {
        const result = await requestDemoAuthLink({
          email,
          requestIp: ctx.ip,
          now: ctx.now,
        });
        await recordDemoEmailRequest({
          email,
          ip: ctx.ip,
          now: ctx.now,
        });
        return result;
      } catch (error) {
        if (error instanceof DemoAuthError) {
          if (error.kind === "demo_disabled") {
            throw new EdgeError({
              kind: "forbidden",
              message: "Demo mode is disabled",
              details: { reason: "demo_disabled" },
              status: 403,
            });
          }
          if (error.kind === "email_send_failed") {
            throw new EdgeError({
              kind: "upstream_error",
              message: error.message,
              details: { service: "resend", status: error.status },
              status: 502,
            });
          }
        }
        throw error;
      }
    },
  });
}
