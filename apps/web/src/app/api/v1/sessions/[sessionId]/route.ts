import { routeContract } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { getSessionDetail } from "@/server/services/sessionViews";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  return handleRoute(request, {
    route: routeContract("sessions.get"),
    params: context.params,
    handler: async (ctx, _request, input) => {
      const auth = requireAuth(ctx.auth);
      return getSessionDetail(auth.userId, input.params.sessionId);
    },
  });
}
