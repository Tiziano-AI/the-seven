import { routeContract } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { requireDemoAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";

export async function GET(request: NextRequest) {
  return handleRoute(request, {
    route: routeContract("demo.session"),
    handler: async (ctx) => {
      const auth = requireDemoAuth(ctx.auth);
      return {
        email: auth.principal,
        expiresAt: auth.expiresAt,
      };
    },
  });
}
