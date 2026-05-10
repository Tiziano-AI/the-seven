import { serverRuntime } from "@the-seven/config";
import { forbiddenDetails, routeContract } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { clearDemoSessionCookie } from "@/server/http/demoCookie";
import { EdgeError } from "@/server/http/errors";
import { requireAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";

export async function POST(request: NextRequest) {
  const response = await handleRoute(request, {
    route: routeContract("demo.logout"),
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      if (auth.kind !== "demo") {
        throw new EdgeError({
          kind: "forbidden",
          message: "Demo session required",
          details: forbiddenDetails("demo_required"),
          status: 403,
        });
      }
      return { success: true };
    },
  });
  if (response.ok) {
    clearDemoSessionCookie(response, serverRuntime());
  }
  return response;
}
