import { routeContract } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { exportSessions } from "@/server/services/sessionViews";

export async function POST(request: NextRequest) {
  return handleRoute(request, {
    route: routeContract("sessions.export"),
    handler: async (ctx, _request, input) => {
      const auth = requireAuth(ctx.auth);
      return exportSessions(auth.userId, input.body.sessionIds);
    },
  });
}
