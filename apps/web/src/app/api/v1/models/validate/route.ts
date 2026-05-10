import { routeContract } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { requireByokAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { validateModelId } from "@/server/services/models";

export async function POST(request: NextRequest) {
  return handleRoute(request, {
    route: routeContract("models.validate"),
    handler: async (ctx, _request, input) => {
      requireByokAuth(ctx.auth);
      return validateModelId(input.body.modelId);
    },
  });
}
