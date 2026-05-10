import { forbiddenDetails, routeContract } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { EdgeError } from "@/server/http/errors";
import { requireAuth, requireByokAuth } from "@/server/http/requireAuth";
import { handleRoute } from "@/server/http/route";
import {
  getOutputFormats,
  removeCouncil,
  replaceCouncil,
  resolveCouncilSnapshot,
} from "@/server/services/councils";
import {
  assertCouncilNameAvailable,
  validateCouncilMembers,
} from "@/server/services/councilValidation";

export async function GET(request: NextRequest, context: { params: Promise<{ locator: string }> }) {
  return handleRoute(request, {
    route: routeContract("councils.get"),
    params: context.params,
    handler: async (ctx, _request, input) => {
      const auth = requireAuth(ctx.auth);
      const ref = input.params.locator;

      if (auth.kind === "demo" && (ref.kind !== "built_in" || ref.slug !== "commons")) {
        throw new EdgeError({
          kind: "forbidden",
          message: "Demo mode only allows Commons Council",
          details: forbiddenDetails("demo_council_only"),
          status: 403,
        });
      }

      const snapshot = await resolveCouncilSnapshot({ userId: auth.userId, ref });
      return {
        ref,
        name: snapshot.nameAtRun,
        phasePrompts: snapshot.phasePrompts,
        outputFormats: getOutputFormats(),
        members: snapshot.members,
        editable: ref.kind === "user",
        deletable: ref.kind === "user",
      };
    },
  });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ locator: string }> }) {
  return handleRoute(request, {
    route: routeContract("councils.update"),
    params: context.params,
    handler: async (ctx, _request, input) => {
      const auth = requireByokAuth(ctx.auth);
      const ref = input.params.locator;
      if (ref.kind !== "user") {
        throw new EdgeError({
          kind: "forbidden",
          message: "Built-in councils are not editable",
          details: forbiddenDetails("built_in_read_only"),
          status: 403,
        });
      }

      await assertCouncilNameAvailable({
        userId: auth.userId,
        name: input.body.name,
        excludeCouncilId: ref.councilId,
      });
      const members = await validateCouncilMembers(input.body.members);
      await replaceCouncil({
        userId: auth.userId,
        councilId: ref.councilId,
        name: input.body.name,
        phasePrompts: input.body.phasePrompts,
        members,
      });
      return { success: true };
    },
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ locator: string }> },
) {
  return handleRoute(request, {
    route: routeContract("councils.delete"),
    params: context.params,
    handler: async (ctx, _request, input) => {
      const auth = requireByokAuth(ctx.auth);
      const ref = input.params.locator;
      if (ref.kind !== "user") {
        throw new EdgeError({
          kind: "forbidden",
          message: "Built-in councils are not deletable",
          details: forbiddenDetails("built_in_read_only"),
          status: 403,
        });
      }

      await removeCouncil({
        userId: auth.userId,
        councilId: ref.councilId,
      });
      return { success: true };
    },
  });
}
