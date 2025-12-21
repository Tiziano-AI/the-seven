import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { byokProcedure, router } from "../../_core/trpc";
import { MEMBER_POSITIONS } from "../../../shared/domain/sevenMembers";
import type { CouncilMemberTuning } from "../../../shared/domain/councilMemberTuning";
import { councilRefSchema } from "../../domain/councilRef";
import {
  councilMemberTuningSchema,
  normalizeCouncilMemberTuningInput,
  stringifyCouncilMemberTuningJson,
} from "../../domain/councilMemberTuning";
import { phasePromptsSchema } from "../../domain/phasePrompts";
import { providerModelRefSchema } from "../../domain/providerModelRef";
import { getOutputFormat } from "../../config";
import { getModelDetails, type OpenRouterModelDetails } from "../../services/openrouterCatalog";
import { listCouncils, resolveCouncilSnapshot } from "../../services/councils";
import * as councilStore from "../../stores/councilStore";

const councilMembersSchema = z
  .array(
    z.object({
      memberPosition: z.number().int().min(1).max(7),
      model: providerModelRefSchema,
      tuning: councilMemberTuningSchema.nullable().optional(),
    })
  )
  .length(7)
  .superRefine((members, ctx) => {
    const seen = new Set<number>();
    for (const member of members) {
      if (seen.has(member.memberPosition)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["members"],
          message: `Duplicate memberPosition ${member.memberPosition}`,
        });
      }
      seen.add(member.memberPosition);
    }
    for (const required of MEMBER_POSITIONS) {
      if (!seen.has(required)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["members"],
          message: `Missing memberPosition ${required}`,
        });
      }
    }
  });

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
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Model ID not found in OpenRouter catalog cache: ${modelId}`,
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

  // UI posture: show only OpenRouter-advertised parameters for the selected model.
  // Persisted councils must match that posture to avoid hidden, surprising behavior at runtime.
  if (params.modelDetails.supportedParameters.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Model does not publish supported_parameters; tuning must be unset for ${params.modelId}`,
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
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Model does not advertise support for tuning parameter(s): ${unsupported.join(", ")} (${params.modelId})`,
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
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Council name already exists",
    });
  }
}

export const councilsRouter = router({
  list: byokProcedure.query(async ({ ctx }) => {
    const councils = await listCouncils(ctx.user.id);
    return { councils };
  }),

  outputFormats: byokProcedure.query(() => {
    return {
      outputFormats: {
        phase1: getOutputFormat(1),
        phase2: getOutputFormat(2),
        phase3: getOutputFormat(3),
      },
    };
  }),

  get: byokProcedure
    .input(z.object({ ref: councilRefSchema }))
    .query(async ({ ctx, input }) => {
      const snapshot = await resolveCouncilSnapshot({ userId: ctx.user.id, ref: input.ref });
      return {
        ref: input.ref,
        name: snapshot.nameAtRun,
        phasePrompts: snapshot.phasePrompts,
        outputFormats: {
          phase1: getOutputFormat(1),
          phase2: getOutputFormat(2),
          phase3: getOutputFormat(3),
        },
        members: snapshot.members,
        editable: input.ref.kind === "user",
        deletable: input.ref.kind === "user",
      };
    }),

  duplicate: byokProcedure
    .input(
      z.object({
        source: councilRefSchema,
        name: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .refine((value) => !/[\r\n]/.test(value), "Council name must be single-line"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireCouncilNameAvailable({ userId: ctx.user.id, name: input.name });

      const snapshot = await resolveCouncilSnapshot({ userId: ctx.user.id, ref: input.source });
      const detailsById = await validateCouncilModelsHard({
        models: snapshot.members.map((m) => ({ modelId: m.model.modelId })),
      });

      const councilId = await councilStore.createCouncil({
        userId: ctx.user.id,
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
    }),

  update: byokProcedure
    .input(
      z.object({
        councilId: z.number().int().positive(),
        name: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .refine((value) => !/[\r\n]/.test(value), "Council name must be single-line"),
        phasePrompts: phasePromptsSchema,
        members: councilMembersSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireCouncilNameAvailable({
        userId: ctx.user.id,
        name: input.name,
        excludeCouncilId: input.councilId,
      });

      const detailsById = await validateCouncilModelsHard({
        models: input.members.map((m) => ({ modelId: m.model.modelId })),
      });

      try {
        await councilStore.updateCouncil({
          userId: ctx.user.id,
          councilId: input.councilId,
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
      } catch (error: unknown) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Council not found",
        });
      }

      return { success: true };
    }),

  delete: byokProcedure
    .input(z.object({ councilId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await councilStore.getCouncilWithMembers({
        userId: ctx.user.id,
        councilId: input.councilId,
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Council not found" });
      }

      await councilStore.deleteCouncil({ userId: ctx.user.id, councilId: input.councilId });
      return { success: true };
    }),
});
