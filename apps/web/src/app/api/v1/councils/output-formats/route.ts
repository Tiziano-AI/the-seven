import { routeContract } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { getOutputFormats } from "@/server/services/councils";

export async function GET(request: NextRequest) {
  return handleRoute(request, {
    route: routeContract("councils.outputFormats"),
    handler: async (ctx) => {
      requireAuth(ctx.auth);
      return { outputFormats: getOutputFormats() };
    },
  });
}
