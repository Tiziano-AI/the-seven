import { routeContract } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { requireByokAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { duplicateCouncilFromSnapshot, resolveCouncilSnapshot } from "@/server/services/councils";
import {
  assertCouncilNameAvailable,
  validateCouncilMembers,
} from "@/server/services/councilValidation";

export async function POST(request: NextRequest) {
  return handleRoute(request, {
    route: routeContract("councils.duplicate"),
    handler: async (ctx, _request, input) => {
      const auth = requireByokAuth(ctx.auth);

      await assertCouncilNameAvailable({
        userId: auth.userId,
        name: input.body.name,
      });

      const snapshot = await resolveCouncilSnapshot({
        userId: auth.userId,
        ref: input.body.source,
      });
      await validateCouncilMembers(snapshot.members);
      return {
        councilId: await duplicateCouncilFromSnapshot({
          userId: auth.userId,
          name: input.body.name,
          snapshot,
        }),
      };
    },
  });
}
