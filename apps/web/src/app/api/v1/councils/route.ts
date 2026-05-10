import { routeContract } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { listCouncils } from "@/server/services/councils";

export async function GET(request: NextRequest) {
  return handleRoute(request, {
    route: routeContract("councils.list"),
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      const councils = await listCouncils(auth.userId);
      return {
        councils:
          auth.kind === "demo"
            ? councils.filter(
                (council) => council.ref.kind === "built_in" && council.ref.slug === "commons",
              )
            : councils,
      };
    },
  });
}
