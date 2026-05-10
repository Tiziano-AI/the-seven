import { forbiddenDetails, routeContract } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { EdgeError } from "@/server/http/errors";
import { requireAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";

export async function GET(request: NextRequest) {
  return handleRoute(request, {
    route: routeContract("demo.session"),
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
      return {
        email: auth.principal,
        expiresAt: auth.expiresAt,
      };
    },
  });
}
