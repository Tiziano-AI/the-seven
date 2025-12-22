import type { CouncilMemberTuning } from "../../../shared/domain/councilMemberTuning";
import { decodeCouncilRef, type CouncilRef } from "../../../shared/domain/councilRef";
import {
  normalizeCouncilMemberTuningInput,
  stringifyCouncilMemberTuningJson,
} from "../../domain/councilMemberTuning";
import { duplicateCouncilBodySchema, updateCouncilBodySchema } from "../../../shared/domain/apiSchemas";
import { getOutputFormat } from "../../config";
import { getModelDetails, type OpenRouterModelDetails } from "../../services/openrouterCatalog";
import { listCouncils, resolveCouncilSnapshot } from "../../services/councils";
import * as councilStore from "../../stores/councilStore";
import { parseJsonBody } from "./parse";
import type { RequestContext } from "./context";
import { EdgeError } from "./errors";
import { requireAuth, requireByokAuth } from "./requireAuth";

async function validateCouncilModelsHard(params: {
  models: ReadonlyArray<{ modelId: string }>;
}): Promise<Map<string, OpenRouterModelDetails>> {
  const seen = new Set<string>();
  const detailsById = new Map<string, OpenRouterModelDetails>();
  for (const model of params.models) {
    const modelId = model.modelId;
    if (seen.has(modelId)) continue;
    seen.add(modelId);
    const details = await getModelDetails(modelId);
    if (!details) {
      throw new EdgeError({
        kind: "invalid_input",
        message: `Model ID not found in OpenRouter catalog cache: ${modelId}`,
        details: { issues: [{ path: "modelId", message: `Unknown model ${modelId}` }] },
        status: 400,
      });
    }

    detailsById.set(modelId, details);
  }

  return detailsById;
}

function validateCouncilMemberTuningHard(params: {
  modelId: string;
  modelDetails: OpenRouterModelDetails;
  tuning: CouncilMemberTuning | null;
}): void {
  if (!params.tuning) return;

  if (params.modelDetails.supportedParameters.length === 0) {
    throw new EdgeError({
      kind: "invalid_input",
      message: `Model does not publish supported_parameters; tuning must be unset for ${params.modelId}`,
      details: { issues: [{ path: "tuning", message: "Unsupported tuning for model" }] },
      status: 400,
    });
  }

  const unsupported: string[] = [];
  if (params.tuning.temperature !== null && !params.modelDetails.supportedParameters.includes("temperature")) {
    unsupported.push("temperature");
  }
  if (params.tuning.seed !== null && !params.modelDetails.supportedParameters.includes("seed")) {
    unsupported.push("seed");
  }
  if (params.tuning.verbosity !== null && !params.modelDetails.supportedParameters.includes("verbosity")) {
    unsupported.push("verbosity");
  }
  if (params.tuning.reasoningEffort !== null && !params.modelDetails.supportedParameters.includes("reasoning")) {
    unsupported.push("reasoning");
  }
  if (
    params.tuning.includeReasoning !== null &&
    !params.modelDetails.supportedParameters.includes("include_reasoning")
  ) {
    unsupported.push("include_reasoning");
  }

  if (unsupported.length > 0) {
    throw new EdgeError({
      kind: "invalid_input",
      message: `Model does not advertise support for tuning parameter(s): ${unsupported.join(", ")} (${params.modelId})`,
      details: { issues: [{ path: "tuning", message: `Unsupported: ${unsupported.join(", ")}` }] },
      status: 400,
    });
  }
}

async function requireCouncilNameAvailable(params: {
  userId: number;
  name: string;
  excludeCouncilId?: number;
}): Promise<void> {
  const existing = await councilStore.getCouncilsByUserId(params.userId);
  const conflict = existing.find((council) => {
    if (params.excludeCouncilId && council.id === params.excludeCouncilId) return false;
    return council.name === params.name;
  });
  if (conflict) {
    throw new EdgeError({
      kind: "invalid_input",
      message: "Council name already exists",
      details: { issues: [{ path: "name", message: "Council name already exists" }] },
      status: 400,
    });
  }
}

export async function handleCouncilsList(ctx: RequestContext): Promise<Readonly<{ councils: Awaited<ReturnType<typeof listCouncils>> }>> {
  if (ctx.auth.kind === "demo") {
    const councils = await listCouncils(ctx.auth.userId);
    return {
      councils: councils.filter((council) => council.ref.kind === "built_in" && council.ref.slug === "commons"),
    };
  }

  const auth = requireByokAuth(ctx.auth);
  const councils = await listCouncils(auth.userId);
  return { councils };
}

export async function handleOutputFormats(ctx: RequestContext): Promise<Readonly<{
  outputFormats: Readonly<{ phase1: string; phase2: string; phase3: string }>;
}>> {
  requireAuth(ctx.auth);
  return {
    outputFormats: {
      phase1: getOutputFormat(1),
      phase2: getOutputFormat(2),
      phase3: getOutputFormat(3),
    },
  };
}

export async function handleCouncilGet(ctx: RequestContext, refValue: string): Promise<Readonly<{
  ref: CouncilRef;
  name: string;
  phasePrompts: Readonly<{ phase1: string; phase2: string; phase3: string }>;
  outputFormats: Readonly<{ phase1: string; phase2: string; phase3: string }>;
  members: ReadonlyArray<Readonly<{ memberPosition: number; model: { provider: string; modelId: string }; tuning: CouncilMemberTuning | null }>>;
  editable: boolean;
  deletable: boolean;
}>> {
  const decoded = decodeCouncilRef(refValue);
  if (!decoded) {
    throw new EdgeError({
      kind: "invalid_input",
      message: "Invalid council reference",
      details: { issues: [{ path: "ref", message: "Invalid council reference" }] },
      status: 400,
    });
  }

  if (ctx.auth.kind === "demo") {
    if (decoded.kind !== "built_in" || decoded.slug !== "commons") {
      throw new EdgeError({
        kind: "forbidden",
        message: "Demo mode only allows Commons Council",
        details: { reason: "demo_council_only" },
        status: 403,
      });
    }
  }

  const auth = requireAuth(ctx.auth);
  const snapshot = await resolveCouncilSnapshot({ userId: auth.userId, ref: decoded });
  return {
    ref: decoded,
    name: snapshot.nameAtRun,
    phasePrompts: snapshot.phasePrompts,
    outputFormats: {
      phase1: getOutputFormat(1),
      phase2: getOutputFormat(2),
      phase3: getOutputFormat(3),
    },
    members: snapshot.members,
    editable: decoded.kind === "user",
    deletable: decoded.kind === "user",
  };
}

export async function handleCouncilDuplicate(ctx: RequestContext, body: unknown): Promise<Readonly<{ councilId: number }>> {
  const auth = requireByokAuth(ctx.auth);
  const input = parseJsonBody(duplicateCouncilBodySchema, body);

  await requireCouncilNameAvailable({ userId: auth.userId, name: input.name });

  const snapshot = await resolveCouncilSnapshot({ userId: auth.userId, ref: input.source });
  const detailsById = await validateCouncilModelsHard({
    models: snapshot.members.map((m) => ({ modelId: m.model.modelId })),
  });

  const councilId = await councilStore.createCouncil({
    userId: auth.userId,
    name: input.name,
    phase1Prompt: snapshot.phasePrompts.phase1,
    phase2Prompt: snapshot.phasePrompts.phase2,
    phase3Prompt: snapshot.phasePrompts.phase3,
    members: snapshot.members.map((member) => {
      const normalizedTuning = normalizeCouncilMemberTuningInput(member.tuning);
      validateCouncilMemberTuningHard({
        modelId: member.model.modelId,
        modelDetails: detailsById.get(member.model.modelId) ?? (() => {
          throw new Error(`Missing model details for ${member.model.modelId}`);
        })(),
        tuning: normalizedTuning,
      });

      return {
        memberPosition: member.memberPosition,
        provider: member.model.provider,
        modelId: member.model.modelId,
        tuningJson: stringifyCouncilMemberTuningJson(normalizedTuning),
      };
    }),
  });

  return { councilId };
}

export async function handleCouncilUpdate(ctx: RequestContext, councilId: number, body: unknown): Promise<Readonly<{ success: true }>> {
  const auth = requireByokAuth(ctx.auth);
  const input = parseJsonBody(updateCouncilBodySchema, body);

  await requireCouncilNameAvailable({
    userId: auth.userId,
    name: input.name,
    excludeCouncilId: councilId,
  });

  const detailsById = await validateCouncilModelsHard({
    models: input.members.map((m) => ({ modelId: m.model.modelId })),
  });

  try {
    await councilStore.updateCouncil({
      userId: auth.userId,
      councilId,
      name: input.name,
      phase1Prompt: input.phasePrompts.phase1,
      phase2Prompt: input.phasePrompts.phase2,
      phase3Prompt: input.phasePrompts.phase3,
      members: input.members.map((member) => {
        const normalizedTuning = normalizeCouncilMemberTuningInput(member.tuning);
        validateCouncilMemberTuningHard({
          modelId: member.model.modelId,
          modelDetails: detailsById.get(member.model.modelId) ?? (() => {
            throw new Error(`Missing model details for ${member.model.modelId}`);
          })(),
          tuning: normalizedTuning,
        });

        return {
          memberPosition: member.memberPosition,
          provider: member.model.provider,
          modelId: member.model.modelId,
          tuningJson: stringifyCouncilMemberTuningJson(normalizedTuning),
        };
      }),
    });
  } catch (_error: unknown) {
    throw new EdgeError({
      kind: "not_found",
      message: "Council not found",
      details: { resource: "council" },
      status: 404,
    });
  }

  return { success: true };
}

export async function handleCouncilDelete(ctx: RequestContext, councilId: number): Promise<Readonly<{ success: true }>> {
  const auth = requireByokAuth(ctx.auth);
  const existing = await councilStore.getCouncilWithMembers({
    userId: auth.userId,
    councilId,
  });
  if (!existing) {
    throw new EdgeError({
      kind: "not_found",
      message: "Council not found",
      details: { resource: "council" },
      status: 404,
    });
  }

  await councilStore.deleteCouncil({ userId: auth.userId, councilId });
  return { success: true };
}
