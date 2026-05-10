import { serverRuntime } from "@the-seven/config";
import {
  forbiddenDetails,
  rateLimitedDetails,
  routeContract,
  unauthorizedDetails,
} from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { redactRateLimitScope } from "@/server/domain/redaction";
import { setDemoSessionCookie } from "@/server/http/demoCookie";
import { EdgeError } from "@/server/http/errors";
import { handleRedirectRoute } from "@/server/http/route";
import { consumeDemoAuthLink, DemoAuthError } from "@/server/services/demoAuth";
import { admitDemoConsume } from "@/server/services/demoLimits";

function mapDemoConsumeError(error: DemoAuthError): EdgeError {
  if (error.kind === "demo_disabled") {
    return new EdgeError({
      kind: "forbidden",
      message: "Demo mode is disabled",
      details: forbiddenDetails("demo_disabled"),
      status: 403,
    });
  }
  if (error.kind === "link_expired") {
    return new EdgeError({
      kind: "unauthorized",
      message: "Demo link expired",
      details: unauthorizedDetails("expired_token"),
      status: 401,
    });
  }
  return new EdgeError({
    kind: "unauthorized",
    message: "Invalid demo link",
    details: unauthorizedDetails("invalid_token"),
    status: 401,
  });
}

export async function GET(request: NextRequest) {
  return handleRedirectRoute(request, {
    route: routeContract("demo.consume"),
    handler: async (ctx, rawRequest, input) => {
      const limited = await admitDemoConsume({
        ip: ctx.ip,
        now: ctx.now,
      });
      if (limited) {
        throw new EdgeError({
          kind: "rate_limited",
          message: "Demo token rate limit exceeded",
          details: rateLimitedDetails({
            scope: redactRateLimitScope(limited.scope),
            limit: limited.limit,
            windowSeconds: limited.windowSeconds,
            resetAt: new Date(limited.resetAtMs).toISOString(),
          }),
          status: 429,
        });
      }

      const env = serverRuntime();
      try {
        const session = await consumeDemoAuthLink({
          token: input.query.token,
          consumedIp: ctx.ip,
          now: ctx.now,
        });
        const response = NextResponse.redirect(new URL("/", rawRequest.nextUrl), 303);
        setDemoSessionCookie({
          response,
          token: session.token,
          expiresAt: new Date(session.expiresAt),
          env,
        });
        return response;
      } catch (error) {
        if (error instanceof DemoAuthError) {
          throw mapDemoConsumeError(error);
        }
        throw error;
      }
    },
  });
}
