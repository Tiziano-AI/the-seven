import { requireAuth } from "./requireAuth";
import type { RequestContext } from "./context";
import { EdgeError } from "./errors";
import { getSessionById, getSessionsByUserId } from "../../stores/sessionStore";
import { getMemberResponsesBySessionId } from "../../stores/memberResponseStore";
import { getMemberReviewsBySessionId } from "../../stores/memberReviewStore";
import { getMemberSynthesisBySessionId } from "../../stores/memberSynthesisStore";
import { getOpenRouterCallsBySessionId } from "../../stores/openRouterCallStore";
import { formatUsdFromMicros, summarizeOpenRouterCalls } from "../../../shared/domain/usage";
import { getModelNamesByIds } from "../../stores/openrouterCacheStore";
import { memberForPosition, parseMemberPosition } from "../../../shared/domain/sevenMembers";
import { parseSessionRunSpecJson } from "../../domain/sessionRunSpec";
import { buildOpenRouterCallViews, type OpenRouterCallView } from "./queryOpenRouterViews";

export async function handleGetSession(ctx: RequestContext, sessionId: number): Promise<Readonly<{
  session: {
    id: number;
    query: string;
    questionHash: string;
    ingressSource: string;
    ingressVersion: string | null;
    councilNameAtRun: string;
    status: string;
    failureKind: string | null;
    createdAt: string;
    updatedAt: string;
  };
  council: {
    nameAtRun: string;
    phasePrompts: Readonly<{ phase1: string; phase2: string; phase3: string }>;
    members: ReadonlyArray<Readonly<{
      member: ReturnType<typeof memberForPosition>;
      model: Readonly<{ provider: string; modelId: string; modelName: string }>;
    }>>;
  };
  responses: ReadonlyArray<Readonly<{
    id: number;
    sessionId: number;
    memberPosition: number;
    modelId: string;
    response: string;
    createdAt: string;
    member: ReturnType<typeof memberForPosition>;
    modelName: string;
    tokensUsed: number | null;
    costUsdMicros: number | null;
  }>>;
  reviews: ReadonlyArray<Readonly<{
    id: number;
    sessionId: number;
    reviewerMemberPosition: number;
    modelId: string;
    reviewContent: string;
    createdAt: string;
    reviewerMember: ReturnType<typeof memberForPosition>;
    modelName: string;
    tokensUsed: number | null;
    costUsdMicros: number | null;
  }>>;
  synthesis: Readonly<{
    id: number;
    sessionId: number;
    memberPosition: number;
    modelId: string;
    synthesis: string;
    createdAt: string;
    member: ReturnType<typeof memberForPosition>;
    modelName: string;
    tokensUsed: number | null;
    costUsdMicros: number | null;
  }> | null;
  openRouterCalls: ReadonlyArray<OpenRouterCallView>;
}>> {
  const auth = requireAuth(ctx.auth);
  const session = await getSessionById(sessionId);
  if (!session || session.userId !== auth.userId) {
    throw new EdgeError({
      kind: "not_found",
      message: "Session not found",
      details: { resource: "session" },
      status: 404,
    });
  }

  const responses = await getMemberResponsesBySessionId(sessionId);
  const reviews = await getMemberReviewsBySessionId(sessionId);
  const synthesis = await getMemberSynthesisBySessionId(sessionId);
  const openRouterCalls = await getOpenRouterCallsBySessionId(sessionId);
  const openRouterCallViews = await buildOpenRouterCallViews(openRouterCalls);

  const modelIds = [
    ...responses.map((response) => response.modelId),
    ...reviews.map((review) => review.modelId),
    ...(synthesis ? [synthesis.modelId] : []),
  ];
  const uniqueModelIds = Array.from(new Set(modelIds));
  const modelNamesById = await getModelNamesByIds(uniqueModelIds);

  const callsByPhaseMember = new Map<string, OpenRouterCallView>();
  for (const call of openRouterCallViews) {
    callsByPhaseMember.set(`${call.phase}:${call.memberPosition}`, call);
  }

  const responsesView = responses.map((response) => {
    const memberPosition = parseMemberPosition(response.memberPosition);
    if (!memberPosition) {
      throw new Error(`Invalid memberPosition in memberResponses: ${response.memberPosition}`);
    }
    const call = callsByPhaseMember.get(`1:${response.memberPosition}`) ?? null;
    return {
      id: response.id,
      sessionId: response.sessionId,
      memberPosition: response.memberPosition,
      modelId: response.modelId,
      response: response.response,
      createdAt: response.createdAt.toISOString(),
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
      id: review.id,
      sessionId: review.sessionId,
      reviewerMemberPosition: review.reviewerMemberPosition,
      modelId: review.modelId,
      reviewContent: review.reviewContent,
      createdAt: review.createdAt.toISOString(),
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
          id: synthesis.id,
          sessionId: synthesis.sessionId,
      memberPosition: synthesis.memberPosition,
      modelId: synthesis.modelId,
      synthesis: synthesis.synthesis,
      createdAt: synthesis.createdAt.toISOString(),
      member: memberForPosition(memberPosition),
      modelName: modelNamesById.get(synthesis.modelId) ?? synthesis.modelId,
      tokensUsed: call?.usageTotalTokens ?? null,
          costUsdMicros: call?.totalCostUsdMicros ?? null,
        };
      })()
    : null;

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
      questionHash: session.questionHash,
      ingressSource: session.ingressSource,
      ingressVersion: session.ingressVersion,
      councilNameAtRun: session.councilNameAtRun,
      status: session.status,
      failureKind: session.failureKind,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    },
    council: councilView,
    responses: responsesView,
    reviews: reviewsView,
    synthesis: synthesisView,
    openRouterCalls: openRouterCallViews,
  };
}

export async function handleListSessions(ctx: RequestContext): Promise<ReadonlyArray<Readonly<{
  id: number;
  query: string;
  questionHash: string;
  ingressSource: string;
  ingressVersion: string | null;
  councilNameAtRun: string;
  status: string;
  failureKind: string | null;
  createdAt: string;
  updatedAt: string;
  totalTokens: number;
  totalCostUsdMicros: number;
  totalCostIsPartial: boolean;
  totalCost: string | null;
}>>> {
  const auth = requireAuth(ctx.auth);
  const sessions = await getSessionsByUserId(auth.userId);

  return Promise.all(
    sessions.map(async (session) => {
      const calls = await getOpenRouterCallsBySessionId(session.id);
      const summary = summarizeOpenRouterCalls(calls);

      return {
        id: session.id,
        query: session.query,
        questionHash: session.questionHash,
        ingressSource: session.ingressSource,
        ingressVersion: session.ingressVersion,
        councilNameAtRun: session.councilNameAtRun,
        status: session.status,
        failureKind: session.failureKind,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        totalTokens: summary.totalTokens,
        totalCostUsdMicros: summary.totalCostUsdMicros,
        totalCostIsPartial: summary.costIsPartial,
        totalCost: summary.costIsPartial
          ? null
          : formatUsdFromMicros(summary.totalCostUsdMicros, 6),
      };
    })
  );
}
