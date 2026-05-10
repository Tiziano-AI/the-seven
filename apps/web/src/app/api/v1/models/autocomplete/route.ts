import { routeContract } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { requireByokAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { autocompleteModels } from "@/server/services/models";

export async function POST(request: NextRequest) {
  return handleRoute(request, {
    route: routeContract("models.autocomplete"),
    handler: async (ctx, _request, input) => {
      requireByokAuth(ctx.auth);
      return {
        suggestions: await autocompleteModels(input.body.query, input.body.limit ?? 10),
      };
    },
  });
}
