import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { byokProcedure, router } from "../../_core/trpc";
import { getMemberResponsesBySessionId } from "../../stores/memberResponseStore";
import { getMemberReviewsBySessionId } from "../../stores/memberReviewStore";
import { createSession, getSessionById, getSessionsByUserId } from "../../stores/sessionStore";
import { getMemberSynthesisBySessionId } from "../../stores/memberSynthesisStore";
import { getOpenRouterCallsBySessionId } from "../../stores/openRouterCallStore";
import { orchestrateSession } from "../../workflows/orchestration";
import { formatUsdFromMicros, summarizeOpenRouterCalls } from "../../../shared/domain/usage";
import { getModelCacheRowById, getModelNamesByIds } from "../../stores/openrouterCacheStore";
import { memberForPosition, parseMemberPosition } from "../../../shared/domain/sevenMembers";
import { councilRefSchema } from "../../domain/councilRef";
import { buildRunSpecFromCouncil } from "../../services/sessionRuns";
import { parseSessionRunSpecJson } from "../../domain/sessionRunSpec";
import { decodeAttachmentToText, type Attachment } from "../../domain/attachments";

const attachmentsInput = z
  .array(
    z.object({
      name: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .refine((value) => !/[\r\n]/.test(value), "Attachment name must be single-line"),
      base64: z.string().min(1),
    })
  )
  .optional();

const storedTextAttachmentsSchema = z.array(
  z.object({
    name: z.string(),
    text: z.string(),
  })
);

function parseTextAttachmentsJson(value: string | null): Attachment[] {
  if (!value) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error: unknown) {
    throw new Error("Invalid attachments JSON");
  }

  return storedTextAttachmentsSchema.parse(parsed);
}

export const queryRouter = router({
  submit: byokProcedure
    .input(
      z.object({
        query: z.string().min(1),
        councilRef: councilRefSchema,
        attachments: attachmentsInput,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const decodedAttachments: Attachment[] = [];
      for (const attachment of input.attachments ?? []) {
        const decoded = await decodeAttachmentToText({ name: attachment.name, base64: attachment.base64 });
        if (!decoded.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: decoded.error.message });
        }
        decodedAttachments.push(decoded.attachment);
      }

      const run = await buildRunSpecFromCouncil({
        userId: ctx.user.id,
        councilRef: input.councilRef,
        query: input.query,
        attachments: decodedAttachments,
      });

      // Validate runSpec before persisting/starting orchestration.
      parseSessionRunSpecJson(run.runSpecJson);

      const sessionId = await createSession({
        userId: ctx.user.id,
        query: input.query,
        attachedFilesMarkdown: JSON.stringify(decodedAttachments),
        councilNameAtRun: run.councilNameAtRun,
        runSpec: run.runSpecJson,
        status: "pending",
      });

      void orchestrateSession({
        traceId: ctx.traceId,
        sessionId,
        userId: ctx.user.id,
        apiKey: ctx.apiKey,
      });

      return { sessionId };
    }),

  continueSession: byokProcedure
    .input(z.object({ sessionId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getSessionById(input.sessionId);
      if (!existing || existing.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }

      if (existing.status !== "failed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Only failed sessions can be continued (status is "${existing.status}")`,
        });
      }

      void orchestrateSession({
        traceId: ctx.traceId,
        sessionId: input.sessionId,
        userId: ctx.user.id,
        apiKey: ctx.apiKey,
      });

      return { sessionId: input.sessionId };
    }),

  rerunSession: byokProcedure
    .input(
      z.object({
        sessionId: z.number().int(),
        councilRef: councilRefSchema,
        queryOverride: z
          .string()
          .min(1)
          .refine((value) => value.trim().length > 0, "Query must not be blank")
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getSessionById(input.sessionId);
      if (!existing || existing.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }

      if (existing.status !== "failed" && existing.status !== "completed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Only terminal sessions can be rerun (status is "${existing.status}")`,
        });
      }

      const query = input.queryOverride ?? existing.query;
      const attachments = parseTextAttachmentsJson(existing.attachedFilesMarkdown);

      const run = await buildRunSpecFromCouncil({
        userId: ctx.user.id,
        councilRef: input.councilRef,
        query,
        attachments,
      });

      // Validate runSpec before persisting/starting orchestration.
      parseSessionRunSpecJson(run.runSpecJson);

      const sessionId = await createSession({
        userId: ctx.user.id,
        query,
        attachedFilesMarkdown: existing.attachedFilesMarkdown,
        councilNameAtRun: run.councilNameAtRun,
        runSpec: run.runSpecJson,
        status: "pending",
      });

      void orchestrateSession({
        traceId: ctx.traceId,
        sessionId,
        userId: ctx.user.id,
        apiKey: ctx.apiKey,
      });

      return { sessionId };
    }),

  getSession: byokProcedure
    .input(z.object({ sessionId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const session = await getSessionById(input.sessionId);
      if (!session || session.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }

      const responses = await getMemberResponsesBySessionId(input.sessionId);
      const reviews = await getMemberReviewsBySessionId(input.sessionId);
      const synthesis = await getMemberSynthesisBySessionId(input.sessionId);
      const openRouterCalls = await getOpenRouterCallsBySessionId(input.sessionId);

      const callModelIds: string[] = [];
      for (const call of openRouterCalls) {
        callModelIds.push(call.requestModelId);
        if (call.responseModel) callModelIds.push(call.responseModel);
        if (call.billedModelId) callModelIds.push(call.billedModelId);
      }

      const modelIds = [
        ...responses.map((response) => response.modelId),
        ...reviews.map((review) => review.modelId),
        ...(synthesis ? [synthesis.modelId] : []),
        ...callModelIds,
      ];
      const uniqueModelIds = Array.from(new Set(modelIds));
      const modelNamesById = await getModelNamesByIds(uniqueModelIds);
      const modelMetaById = new Map<string, Readonly<{ contextLength: number | null; maxCompletionTokens: number | null }>>();
      await Promise.all(
        uniqueModelIds.map(async (modelId) => {
          const row = await getModelCacheRowById(modelId);
          if (!row) return;
          modelMetaById.set(modelId, {
            contextLength: row.contextLength,
            maxCompletionTokens: row.maxCompletionTokens,
          });
        })
      );

      const callsByPhaseMember = new Map<string, (typeof openRouterCalls)[number]>();
      for (const call of openRouterCalls) {
        callsByPhaseMember.set(`${call.phase}:${call.memberPosition}`, call);
      }

      const responsesView = responses.map((response) => {
        const memberPosition = parseMemberPosition(response.memberPosition);
        if (!memberPosition) {
          throw new Error(`Invalid memberPosition in memberResponses: ${response.memberPosition}`);
        }
        const call = callsByPhaseMember.get(`1:${response.memberPosition}`) ?? null;
        return {
          ...response,
          member: memberForPosition(memberPosition),
          modelName: modelNamesById.get(response.modelId) ?? response.modelId,
          tokensUsed: call?.usageTotalTokens ?? null,
          costUsdMicros: call?.totalCostUsdMicros ?? null,
        };
      });

      const reviewsView = reviews.map((review) => {
        const memberPosition = parseMemberPosition(review.reviewerMemberPosition);
        if (!memberPosition) {
          throw new Error(
            `Invalid reviewerMemberPosition in memberReviews: ${review.reviewerMemberPosition}`
          );
        }
        const call = callsByPhaseMember.get(`2:${review.reviewerMemberPosition}`) ?? null;
        return {
          ...review,
          reviewerMember: memberForPosition(memberPosition),
          modelName: modelNamesById.get(review.modelId) ?? review.modelId,
          tokensUsed: call?.usageTotalTokens ?? null,
          costUsdMicros: call?.totalCostUsdMicros ?? null,
        };
      });

      const synthesisView = synthesis
        ? (() => {
            const memberPosition = parseMemberPosition(synthesis.memberPosition);
            if (!memberPosition) {
              throw new Error(
                `Invalid memberPosition in memberSyntheses: ${synthesis.memberPosition}`
              );
            }
            const call = callsByPhaseMember.get(`3:${synthesis.memberPosition}`) ?? null;
            return {
              ...synthesis,
              member: memberForPosition(memberPosition),
              modelName: modelNamesById.get(synthesis.modelId) ?? synthesis.modelId,
              tokensUsed: call?.usageTotalTokens ?? null,
              costUsdMicros: call?.totalCostUsdMicros ?? null,
            };
          })()
        : null;

      const callsView = openRouterCalls.map((call) => {
        const memberPosition = parseMemberPosition(call.memberPosition);
        if (!memberPosition) {
          throw new Error(`Invalid memberPosition in openRouterCalls: ${call.memberPosition}`);
        }

        return {
          ...call,
          member: memberForPosition(memberPosition),
          requestModelName: modelNamesById.get(call.requestModelId) ?? call.requestModelId,
          responseModelName: call.responseModel ? modelNamesById.get(call.responseModel) ?? call.responseModel : null,
          billedModelName: call.billedModelId ? modelNamesById.get(call.billedModelId) ?? call.billedModelId : null,
          requestModelContextLength: modelMetaById.get(call.requestModelId)?.contextLength ?? null,
          requestModelMaxCompletionTokens:
            modelMetaById.get(call.requestModelId)?.maxCompletionTokens ?? null,
          responseModelContextLength: call.responseModel ? modelMetaById.get(call.responseModel)?.contextLength ?? null : null,
          responseModelMaxCompletionTokens: call.responseModel ? modelMetaById.get(call.responseModel)?.maxCompletionTokens ?? null : null,
        };
      });

      const runSpec = parseSessionRunSpecJson(session.runSpec);
      const councilModelIds = runSpec.council.members.map((m) => m.model.modelId);
      const councilModelNamesById = await getModelNamesByIds(Array.from(new Set(councilModelIds)));
      const councilView = {
        nameAtRun: runSpec.council.nameAtRun,
        phasePrompts: runSpec.council.phasePrompts,
        members: runSpec.council.members.map((member) => {
          const memberPosition = parseMemberPosition(member.memberPosition);
          if (!memberPosition) {
            throw new Error(`Invalid memberPosition in runSpec: ${member.memberPosition}`);
          }
          return {
            member: memberForPosition(memberPosition),
            model: {
              provider: member.model.provider,
              modelId: member.model.modelId,
              modelName:
                councilModelNamesById.get(member.model.modelId) ?? member.model.modelId,
            },
          };
        }),
      };

      return {
        session: {
          id: session.id,
          query: session.query,
          councilNameAtRun: session.councilNameAtRun,
          status: session.status,
          failureKind: session.failureKind,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
        council: councilView,
        responses: responsesView,
        reviews: reviewsView,
        synthesis: synthesisView,
        openRouterCalls: callsView,
      };
    }),

  listSessions: byokProcedure.query(async ({ ctx }) => {
    const sessions = await getSessionsByUserId(ctx.user.id);

    return Promise.all(
      sessions.map(async (session) => {
        const calls = await getOpenRouterCallsBySessionId(session.id);
        const summary = summarizeOpenRouterCalls(calls);

        return {
          id: session.id,
          query: session.query,
          councilNameAtRun: session.councilNameAtRun,
          status: session.status,
          failureKind: session.failureKind,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          totalTokens: summary.totalTokens,
          totalCostUsdMicros: summary.totalCostUsdMicros,
          totalCostIsPartial: summary.costIsPartial,
          totalCost: summary.costIsPartial
            ? null
            : formatUsdFromMicros(summary.totalCostUsdMicros, 6),
        };
      })
    );
  }),

  getSessionDiagnostics: byokProcedure
    .input(z.object({ sessionId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const session = await getSessionById(input.sessionId);
      if (!session || session.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }

      const runSpec = parseSessionRunSpecJson(session.runSpec);
      const attachments = parseTextAttachmentsJson(session.attachedFilesMarkdown);
      const calls = await getOpenRouterCallsBySessionId(input.sessionId);

      const requestModelIds = calls.map((c) => c.requestModelId);
      const billedModelIds = calls.map((c) => c.billedModelId).filter((id): id is string => !!id);
      const modelNamesById = await getModelNamesByIds(
        Array.from(new Set([...requestModelIds, ...billedModelIds]))
      );
      const modelMetaById = new Map<string, Readonly<{ contextLength: number | null; maxCompletionTokens: number | null }>>();
      await Promise.all(
        Array.from(new Set(requestModelIds)).map(async (modelId) => {
          const row = await getModelCacheRowById(modelId);
          if (!row) return;
          modelMetaById.set(modelId, {
            contextLength: row.contextLength,
            maxCompletionTokens: row.maxCompletionTokens,
          });
        })
      );

      const callsView = calls.map((call) => {
        const memberPosition = parseMemberPosition(call.memberPosition);
        if (!memberPosition) {
          throw new Error(`Invalid memberPosition in openRouterCalls: ${call.memberPosition}`);
        }

        return {
          ...call,
          member: memberForPosition(memberPosition),
          requestModelName: modelNamesById.get(call.requestModelId) ?? call.requestModelId,
          responseModelName: call.responseModel ? modelNamesById.get(call.responseModel) ?? call.responseModel : null,
          billedModelName: call.billedModelId ? modelNamesById.get(call.billedModelId) ?? call.billedModelId : null,
          requestModelContextLength: modelMetaById.get(call.requestModelId)?.contextLength ?? null,
          requestModelMaxCompletionTokens:
            modelMetaById.get(call.requestModelId)?.maxCompletionTokens ?? null,
        };
      });

      return {
        session: {
          id: session.id,
          status: session.status,
          failureKind: session.failureKind,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
        runSpec: {
          createdAt: runSpec.createdAt,
          userMessage: runSpec.userMessage,
          outputFormats: runSpec.outputFormats,
          council: {
            nameAtRun: runSpec.council.nameAtRun,
            phasePrompts: runSpec.council.phasePrompts,
            members: runSpec.council.members.map((member) => ({
              memberPosition: member.memberPosition,
              model: member.model,
              tuning: member.tuning ?? null,
            })),
          },
        },
        attachments,
        openRouterCalls: callsView,
      };
    }),
});
