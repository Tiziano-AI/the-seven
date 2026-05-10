import { routeContract } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { rerunSession } from "@/server/services/sessionSubmission";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  return handleRoute(request, {
    route: routeContract("sessions.rerun"),
    params: context.params,
    handler: async (ctx, _request, input) => {
      const auth = requireAuth(ctx.auth);
      return rerunSession({
        auth,
        ip: ctx.ip,
        now: ctx.now,
        traceId: ctx.traceId,
        ingressSource: ctx.ingress.source,
        ingressVersion: ctx.ingress.version,
        sessionId: input.params.sessionId,
        councilRef: input.body.councilRef,
        queryOverride: input.body.queryOverride,
      });
    },
  });
}
