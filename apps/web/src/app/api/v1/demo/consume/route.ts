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

type BrowserDemoLinkState = "invalid" | "expired" | "disabled";

function browserDemoLinkState(error: DemoAuthError): BrowserDemoLinkState {
  if (error.kind === "demo_disabled") {
    return "disabled";
  }
  if (error.kind === "link_expired") {
    return "expired";
  }
  return "invalid";
}

function demoLinkRecoveryRedirect(input: {
  publicOrigin: string;
  state: BrowserDemoLinkState;
}): NextResponse {
  const url = new URL("/", input.publicOrigin);
  url.searchParams.set("demo_link", input.state);
  return NextResponse.redirect(url, 303);
}

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
    preAdmission: (req) => {
      const env = serverRuntime();
      const publicOriginHost = new URL(env.publicOrigin).host;
      if (req.headers.get("host") !== publicOriginHost) {
        throw new EdgeError({
          kind: "forbidden",
          message: "Demo consume must use the configured public origin",
          details: forbiddenDetails("public_origin_required"),
          status: 403,
        });
      }
      const isApiIngress = req.headers.get("x-seven-ingress") === "api";
      const token = req.nextUrl.searchParams.get("token");
      if (!token && !isApiIngress) {
        return demoLinkRecoveryRedirect({
          publicOrigin: env.publicOrigin,
          state: "invalid",
        });
      }
    },
    handler: async (ctx, _rawRequest, input) => {
      const env = serverRuntime();

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

      try {
        const session = await consumeDemoAuthLink({
          token: input.query.token,
          consumedIp: ctx.ip,
          now: ctx.now,
        });
        const response = NextResponse.redirect(new URL("/", env.publicOrigin), 303);
        setDemoSessionCookie({
          response,
          token: session.token,
          expiresAt: new Date(session.expiresAt),
          env,
        });
        return response;
      } catch (error) {
        if (error instanceof DemoAuthError) {
          if (ctx.ingress.source === "api") {
            throw mapDemoConsumeError(error);
          }
          return demoLinkRecoveryRedirect({
            publicOrigin: env.publicOrigin,
            state: browserDemoLinkState(error),
          });
        }
        throw error;
      }
    },
  });
}
