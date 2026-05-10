import { routeContract } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { continueSession } from "@/server/services/sessionSubmission";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  return handleRoute(request, {
    route: routeContract("sessions.continue"),
    params: context.params,
    handler: async (ctx, _request, input) => {
      const auth = requireAuth(ctx.auth);
      return continueSession({
        auth,
        ip: ctx.ip,
        now: ctx.now,
        sessionId: input.params.sessionId,
      });
    },
  });
}
