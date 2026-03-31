import { queryContinueBodySchema } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { EdgeError } from "@/server/http/errors";
import { parsePositiveIntSegment } from "@/server/http/params";
import { parseJsonBody } from "@/server/http/parse";
import { requireAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { continueSession } from "@/server/services/sessionSubmission";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  return handleRoute(request, {
    resource: "sessions.continue",
    handler: async (ctx, rawRequest) => {
      const auth = requireAuth(ctx.auth);
      const params = await context.params;
      const sessionId = parsePositiveIntSegment(params.sessionId, "sessionId");
      const input = await parseJsonBody(rawRequest, queryContinueBodySchema);
      if (input.sessionId !== sessionId) {
        throw new EdgeError({
          kind: "invalid_input",
          message: "Session id mismatch",
          details: {
            issues: [{ path: "sessionId", message: "Path and body session ids must match" }],
          },
          status: 400,
        });
      }
      return continueSession({
        auth,
        ip: ctx.ip,
        now: ctx.now,
        sessionId,
      });
    },
  });
}
