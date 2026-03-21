import { querySubmitBodySchema } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { parseJsonBody } from "@/server/http/parse";
import { requireAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { submitSession } from "@/server/services/sessionSubmission";
import { listSessionSummaries } from "@/server/services/sessionViews";

export async function GET(request: NextRequest) {
  return handleRoute(request, {
    resource: "sessions.list",
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      return await listSessionSummaries(auth.userId);
    },
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(request, {
    resource: "sessions.create",
    status: 201,
    handler: async (ctx, rawRequest) => {
      const auth = requireAuth(ctx.auth);
      const input = await parseJsonBody(rawRequest, querySubmitBodySchema);
      return submitSession({
        auth,
        ip: ctx.ip,
        now: ctx.now,
        ingressSource: ctx.ingress.source,
        ingressVersion: ctx.ingress.version,
        traceId: ctx.traceId,
        query: input.query,
        councilRef: input.councilRef,
        attachments: input.attachments,
      });
    },
  });
}
