import { routeContract } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { requireByokAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";

export async function POST(request: NextRequest) {
  return handleRoute(request, {
    route: routeContract("auth.validate"),
    handler: async (ctx) => {
      requireByokAuth(ctx.auth);
      return { valid: true };
    },
  });
}
