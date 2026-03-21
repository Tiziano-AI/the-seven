import type { NextRequest } from "next/server";
import { requireAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import { getOutputFormats } from "@/server/services/councils";

export async function GET(request: NextRequest) {
  return handleRoute(request, {
    resource: "councils.output_formats",
    handler: async (ctx) => {
      requireAuth(ctx.auth);
      return { outputFormats: getOutputFormats() };
    },
  });
}
