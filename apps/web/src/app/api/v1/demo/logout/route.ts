import { serverRuntime } from "@the-seven/config";
import { routeContract, unauthorizedDetails } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { clearDemoSessionCookie } from "@/server/http/demoCookie";
import { EdgeError } from "@/server/http/errors";
import { requireDemoAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { endDemoSession } from "@/server/services/demoAuth";

export async function POST(request: NextRequest) {
  const response = await handleRoute(request, {
    route: routeContract("demo.logout"),
    handler: async (ctx) => {
      const auth = requireDemoAuth(ctx.auth);
      const revoked = await endDemoSession({
        sessionId: auth.demoSessionId,
        now: ctx.now,
      });
      if (!revoked) {
        throw new EdgeError({
          kind: "unauthorized",
          message: "Invalid demo session",
          details: unauthorizedDetails("invalid_token"),
          status: 401,
        });
      }
      return { success: true };
    },
  });
  if (response.ok || response.status === 401) {
    clearDemoSessionCookie(response, serverRuntime());
  }
  return response;
}
