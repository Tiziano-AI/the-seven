import { exportSessionsBodySchema } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { parseJsonBody } from "@/server/http/parse";
import { requireAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { exportSessions } from "@/server/services/sessionViews";

export async function POST(request: NextRequest) {
  return handleRoute(request, {
    resource: "sessions.export",
    handler: async (ctx, rawRequest) => {
      const auth = requireAuth(ctx.auth);
      const input = await parseJsonBody(rawRequest, exportSessionsBodySchema);
      return exportSessions(auth.userId, input.sessionIds);
    },
  });
}
