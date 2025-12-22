import { requireAuth } from "./requireAuth";
import type { RequestContext } from "./context";
import { EdgeError } from "./errors";
import { parseSessionRunSpecJson } from "../../domain/sessionRunSpec";
import { normalizeCouncilMemberTuningInput } from "../../domain/councilMemberTuning";
import { getSessionById } from "../../stores/sessionStore";
import { getOpenRouterCallsBySessionId } from "../../stores/openRouterCallStore";
import { parseTextAttachmentsJson } from "./queryAttachments";
import type { Attachment } from "../../domain/attachments";
import { buildOpenRouterCallViews, type OpenRouterCallView } from "./queryOpenRouterViews";

export async function handleSessionDiagnostics(ctx: RequestContext, sessionId: number): Promise<Readonly<{
  session: {
    id: number;
    status: string;
    failureKind: string | null;
    questionHash: string;
    ingressSource: string;
    ingressVersion: string | null;
    createdAt: string;
    updatedAt: string;
  };
  runSpec: {
    createdAt: string;
    userMessage: string;
    outputFormats: Readonly<{ phase1: string; phase2: string; phase3: string }>;
    council: {
      nameAtRun: string;
      phasePrompts: Readonly<{ phase1: string; phase2: string; phase3: string }>;
      members: ReadonlyArray<Readonly<{
        memberPosition: number;
        model: Readonly<{ provider: string; modelId: string }>;
        tuning: Readonly<{
          temperature: number | null;
          seed: number | null;
          verbosity: string | null;
          reasoningEffort: string | null;
          includeReasoning: boolean | null;
        }> | null;
      }>>;
    };
  };
  attachments: Attachment[];
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

  const runSpec = parseSessionRunSpecJson(session.runSpec);
  const attachments = parseTextAttachmentsJson(session.attachedFilesMarkdown);
  const calls = await getOpenRouterCallsBySessionId(sessionId);
  const openRouterCalls = await buildOpenRouterCallViews(calls);

  return {
    session: {
      id: session.id,
      status: session.status,
      failureKind: session.failureKind,
      questionHash: session.questionHash,
      ingressSource: session.ingressSource,
      ingressVersion: session.ingressVersion,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
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
          tuning: normalizeCouncilMemberTuningInput(member.tuning),
        })),
      },
    },
    attachments,
    openRouterCalls,
  };
}
