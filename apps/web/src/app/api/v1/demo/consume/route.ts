import { demoConsumeBodySchema } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { EdgeError } from "@/server/http/errors";
import { parseJsonBody } from "@/server/http/parse";
import { handleRoute } from "@/server/http/route";
import { consumeDemoAuthLink, DemoAuthError } from "@/server/services/demoAuth";
import { admitDemoConsume } from "@/server/services/demoLimits";

export async function POST(request: NextRequest) {
  return handleRoute(request, {
    resource: "demo.consume",
    handler: async (ctx, rawRequest) => {
      const input = await parseJsonBody(rawRequest, demoConsumeBodySchema);
      const limited = await admitDemoConsume({
        ip: ctx.ip,
        now: ctx.now,
      });
      if (limited) {
        throw new EdgeError({
          kind: "rate_limited",
          message: "Demo token rate limit exceeded",
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
        return await consumeDemoAuthLink({
          token: input.token,
          consumedIp: ctx.ip,
          now: ctx.now,
        });
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
          if (error.kind === "link_not_found" || error.kind === "link_used") {
            throw new EdgeError({
              kind: "unauthorized",
              message: "Invalid demo link",
              details: { reason: "invalid_token" },
              status: 401,
            });
          }
          if (error.kind === "link_expired") {
            throw new EdgeError({
              kind: "unauthorized",
              message: "Demo link expired",
              details: { reason: "expired_token" },
              status: 401,
            });
          }
        }
        throw error;
      }
    },
  });
}
