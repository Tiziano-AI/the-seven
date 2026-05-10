import { serverRuntime } from "@the-seven/config";
import { forbiddenDetails, routeContract } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { redactRateLimitScope } from "@/server/domain/redaction";
import { EdgeError } from "@/server/http/errors";
import { handleRoute } from "@/server/http/route";
import { DemoAuthError, requestDemoAuthLink } from "@/server/services/demoAuth";
import { admitDemoEmailRequest } from "@/server/services/demoLimits";

export async function POST(request: NextRequest) {
  return handleRoute(request, {
    route: routeContract("demo.request"),
    handler: async (ctx, _request, input) => {
      const email = input.body.email.trim().toLowerCase();
      const env = serverRuntime();

      if (!env.demo.enabled) {
        throw new EdgeError({
          kind: "forbidden",
          message: "Demo mode is disabled",
          details: forbiddenDetails("demo_disabled"),
          status: 403,
        });
      }

      const limited = await admitDemoEmailRequest({
        email,
        ip: ctx.ip,
        now: ctx.now,
      });
      if (limited) {
        throw new EdgeError({
          kind: "rate_limited",
          message: "Demo email rate limit exceeded",
          details: {
            scope: redactRateLimitScope(limited.scope),
            limit: limited.limit,
            windowSeconds: limited.windowSeconds,
            resetAt: new Date(limited.resetAtMs).toISOString(),
          },
          status: 429,
        });
      }

      try {
        return await requestDemoAuthLink({
          email,
          requestIp: ctx.ip,
          now: ctx.now,
        });
      } catch (error) {
        if (error instanceof DemoAuthError) {
          if (error.kind === "demo_disabled") {
            throw new EdgeError({
              kind: "forbidden",
              message: "Demo mode is disabled",
              details: forbiddenDetails("demo_disabled"),
              status: 403,
            });
          }
        }
        throw error;
      }
    },
  });
}
