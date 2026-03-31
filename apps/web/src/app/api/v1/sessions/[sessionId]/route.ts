import type { NextRequest } from "next/server";
import { parsePositiveIntSegment } from "@/server/http/params";
import { requireAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { getSessionDetail } from "@/server/services/sessionViews";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  return handleRoute(request, {
    resource: "sessions.get",
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      const params = await context.params;
      return getSessionDetail(auth.userId, parsePositiveIntSegment(params.sessionId, "sessionId"));
    },
  });
}
