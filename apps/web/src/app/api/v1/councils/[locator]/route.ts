import { decodeCouncilRef, updateCouncilBodySchema } from "@the-seven/contracts";
import type { NextRequest } from "next/server";
import { EdgeError } from "@/server/http/errors";
import { parseJsonBody } from "@/server/http/parse";
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

function decodeLocator(locator: string) {
  const decoded = decodeCouncilRef(locator);
  if (!decoded) {
    throw new EdgeError({
      kind: "invalid_input",
      message: "Invalid council reference",
      details: { issues: [{ path: "locator", message: "Invalid council reference" }] },
      status: 400,
    });
  }
  return decoded;
}

export async function GET(request: NextRequest, context: { params: Promise<{ locator: string }> }) {
  return handleRoute(request, {
    resource: "councils.get",
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      const params = await context.params;
      const ref = decodeLocator(params.locator);

      if (auth.kind === "demo" && (ref.kind !== "built_in" || ref.slug !== "commons")) {
        throw new EdgeError({
          kind: "forbidden",
          message: "Demo mode only allows Commons Council",
          details: { reason: "demo_council_only" },
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
    resource: "councils.update",
    handler: async (ctx, rawRequest) => {
      const auth = requireByokAuth(ctx.auth);
      const params = await context.params;
      const ref = decodeLocator(params.locator);
      if (ref.kind !== "user") {
        throw new EdgeError({
          kind: "forbidden",
          message: "Built-in councils are not editable",
          details: { reason: "built_in_read_only" },
          status: 403,
        });
      }

      const input = await parseJsonBody(rawRequest, updateCouncilBodySchema);
      await assertCouncilNameAvailable({
        userId: auth.userId,
        name: input.name,
        excludeCouncilId: ref.councilId,
      });
      const members = await validateCouncilMembers(input.members);
      await replaceCouncil({
        userId: auth.userId,
        councilId: ref.councilId,
        name: input.name,
        phasePrompts: input.phasePrompts,
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
    resource: "councils.delete",
    handler: async (ctx) => {
      const auth = requireByokAuth(ctx.auth);
      const params = await context.params;
      const ref = decodeLocator(params.locator);
      if (ref.kind !== "user") {
        throw new EdgeError({
          kind: "forbidden",
          message: "Built-in councils are not deletable",
          details: { reason: "built_in_read_only" },
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
