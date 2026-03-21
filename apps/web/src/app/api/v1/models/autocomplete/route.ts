import { modelAutocompleteBodySchema } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { parseJsonBody } from "@/server/http/parse";
import { requireByokAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { autocompleteModels } from "@/server/services/models";

export async function POST(request: NextRequest) {
  return handleRoute(request, {
    resource: "models.autocomplete",
    handler: async (ctx, rawRequest) => {
      requireByokAuth(ctx.auth);
      const input = await parseJsonBody(rawRequest, modelAutocompleteBodySchema);
      return {
        suggestions: await autocompleteModels(input.query, input.limit ?? 10),
      };
    },
  });
}
