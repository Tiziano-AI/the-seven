import type { NextRequest } from "next/server";
import { validateOpenRouterApiKey } from "@/server/adapters/openrouter";
import { EdgeError } from "@/server/http/errors";
import { handleRoute } from "@/server/http/route";

export async function POST(request: NextRequest) {
  return handleRoute(request, {
    resource: "auth.validate",
    handler: async (ctx) => {
      if (ctx.auth.kind !== "byok") {
        throw new EdgeError({
          kind: "unauthorized",
          message: "Missing OpenRouter API key",
          details: { reason: ctx.auth.kind === "invalid" ? ctx.auth.reason : "missing_auth" },
          status: 401,
        });
      }

      return {
        valid: await validateOpenRouterApiKey(ctx.auth.openRouterKey),
      };
    },
  });
}
