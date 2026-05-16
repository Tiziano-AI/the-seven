import { serverRuntime } from "@the-seven/config";
import {
  forbiddenDetails,
  invalidInputDetails,
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

function normalizeHostAuthority(input: { host: string | null; protocol: string }): string | null {
  const raw = input.host?.trim();
  if (!raw || /[\r\n]/.test(raw)) {
    return null;
  }
  if (/[\s/@?#\\]/.test(raw)) {
    return null;
  }

  try {
    const parsed = new URL(`${input.protocol}//${raw}`);
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return parsed.port ? `${hostname}:${parsed.port}` : hostname;
  } catch {
    return null;
  }
}

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
      const publicOrigin = new URL(env.publicOrigin);
      const expectedHost = normalizeHostAuthority({
        host: publicOrigin.host,
        protocol: publicOrigin.protocol,
      });
      const requestHost = normalizeHostAuthority({
        host: req.headers.get("host"),
        protocol: publicOrigin.protocol,
      });
      if (!requestHost || requestHost !== expectedHost) {
        throw new EdgeError({
          kind: "forbidden",
          message: "Demo consume must use the configured public origin",
          details: forbiddenDetails("public_origin_required"),
          status: 403,
        });
      }
    },
    handler: async (ctx, _rawRequest, input) => {
      const env = serverRuntime();
      const token = input.query.token;
      if (!token) {
        if (ctx.ingress.source === "api") {
          throw new EdgeError({
            kind: "invalid_input",
            message: "Invalid query parameters",
            details: invalidInputDetails({
              reason: "invalid_request",
              issues: [{ path: "query.token", message: "Required" }],
            }),
            status: 400,
          });
        }
        return demoLinkRecoveryRedirect({
          publicOrigin: env.publicOrigin,
          state: "invalid",
        });
      }

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
          token,
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
