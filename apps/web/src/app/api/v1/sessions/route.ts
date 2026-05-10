import { routeContract } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { submitSession } from "@/server/services/sessionSubmission";
import { listSessionSummaries } from "@/server/services/sessionViews";

export async function GET(request: NextRequest) {
  return handleRoute(request, {
    route: routeContract("sessions.list"),
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      return await listSessionSummaries(auth.userId);
    },
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(request, {
    route: routeContract("sessions.create"),
    handler: async (ctx, _request, input) => {
      const auth = requireAuth(ctx.auth);
      return submitSession({
        auth,
        ip: ctx.ip,
        now: ctx.now,
        ingressSource: ctx.ingress.source,
        ingressVersion: ctx.ingress.version,
        traceId: ctx.traceId,
        query: input.body.query,
        councilRef: input.body.councilRef,
        attachments: input.body.attachments,
      });
    },
  });
}
