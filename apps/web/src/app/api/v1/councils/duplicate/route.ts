import { duplicateCouncilBodySchema } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { parseJsonBody } from "@/server/http/parse";
import { requireByokAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { duplicateCouncilFromSnapshot, resolveCouncilSnapshot } from "@/server/services/councils";
import {
  assertCouncilNameAvailable,
  validateCouncilMembers,
} from "@/server/services/councilValidation";

export async function POST(request: NextRequest) {
  return handleRoute(request, {
    resource: "councils.duplicate",
    handler: async (ctx, rawRequest) => {
      const auth = requireByokAuth(ctx.auth);
      const input = await parseJsonBody(rawRequest, duplicateCouncilBodySchema);

      await assertCouncilNameAvailable({
        userId: auth.userId,
        name: input.name,
      });

      const snapshot = await resolveCouncilSnapshot({
        userId: auth.userId,
        ref: input.source,
      });
      await validateCouncilMembers(snapshot.members);
      return {
        councilId: await duplicateCouncilFromSnapshot({
          userId: auth.userId,
          name: input.name,
          snapshot,
        }),
      };
    },
  });
}
