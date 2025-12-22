import { requireAuth } from "./requireAuth";
import { parseJsonBody } from "./parse";
import type { RequestContext } from "./context";
import { EdgeError } from "./errors";
import { decodeAttachmentToText, type Attachment } from "../../domain/attachments";
import type { CouncilRef } from "../../../shared/domain/councilRef";
import { buildRunSpecFromCouncil } from "../../services/sessionRuns";
import { parseSessionRunSpecJson } from "../../domain/sessionRunSpec";
import { startOrchestration } from "../../workflows/orchestrationRunner";
import { createSession, getSessionById } from "../../stores/sessionStore";
import { checkDemoRunLimits } from "../../services/demoRateLimits";
import { parseTextAttachmentsJson } from "./queryAttachments";
import { hashQuestion } from "../../domain/questionHash";
import { BUILT_IN_COUNCILS } from "../../domain/builtInCouncils";
import {
  queryContinueBodySchema,
  queryRerunBodySchema,
  querySubmitBodySchema,
} from "../../../shared/domain/apiSchemas";

async function enforceDemoRunLimit(ctx: RequestContext): Promise<void> {
  if (ctx.auth.kind !== "demo") return;
  const limit = await checkDemoRunLimits({
    email: ctx.auth.email,
    ip: ctx.ip,
    now: ctx.now,
  });
  if (limit) {
    throw new EdgeError({
      kind: "rate_limited",
      message: "Demo run rate limit exceeded",
      details: {
        scope: limit.scope,
        limit: limit.limit,
        windowSeconds: limit.windowSeconds,
        resetAt: new Date(limit.resetAtMs).toISOString(),
      },
      status: 429,
    });
  }
}

function requireCommonsCouncil(ref: CouncilRef): void {
  if (ref.kind === "built_in" && ref.slug === "commons") return;
  throw new EdgeError({
    kind: "forbidden",
    message: "Demo mode only allows Commons Council",
    details: { reason: "demo_council_only" },
    status: 403,
  });
}

function requireCommonsSession(session: Readonly<{ councilNameAtRun: string }>): void {
  if (session.councilNameAtRun === BUILT_IN_COUNCILS.commons.name) return;
  throw new EdgeError({
    kind: "forbidden",
    message: "Demo mode only allows Commons Council",
    details: { reason: "demo_council_only" },
    status: 403,
  });
}

export async function handleQuerySubmit(ctx: RequestContext, body: unknown): Promise<Readonly<{ sessionId: number }>> {
  const auth = requireAuth(ctx.auth);
  const input = parseJsonBody(querySubmitBodySchema, body);

  if (auth.kind === "demo") {
    requireCommonsCouncil(input.councilRef);
    await enforceDemoRunLimit(ctx);
  }

  const decodedAttachments: Attachment[] = [];
  for (const attachment of input.attachments ?? []) {
    const decoded = await decodeAttachmentToText({ name: attachment.name, base64: attachment.base64 });
    if (!decoded.ok) {
      throw new EdgeError({
        kind: "invalid_input",
        message: decoded.error.message,
        details: { issues: [{ path: "attachments", message: decoded.error.message }] },
        status: 400,
      });
    }
    decodedAttachments.push(decoded.attachment);
  }

  const run = await buildRunSpecFromCouncil({
    userId: auth.userId,
    councilRef: input.councilRef,
    query: input.query,
    attachments: decodedAttachments,
  });

  const parsedRunSpec = parseSessionRunSpecJson(run.runSpecJson);
  const questionHash = hashQuestion(parsedRunSpec.userMessage);

  const sessionId = await createSession({
    userId: auth.userId,
    query: input.query,
    attachedFilesMarkdown: JSON.stringify(decodedAttachments),
    councilNameAtRun: run.councilNameAtRun,
    runSpec: run.runSpecJson,
    questionHash,
    ingressSource: ctx.ingress.source,
    ingressVersion: ctx.ingress.version,
    status: "pending",
  });

  startOrchestration({
    traceId: ctx.traceId,
    sessionId,
    userId: auth.userId,
    apiKey: auth.openRouterKey,
  });

  return { sessionId };
}

export async function handleContinueSession(ctx: RequestContext, body: unknown): Promise<Readonly<{ sessionId: number }>> {
  const auth = requireAuth(ctx.auth);
  const input = parseJsonBody(queryContinueBodySchema, body);

  const existing = await getSessionById(input.sessionId);
  if (!existing || existing.userId !== auth.userId) {
    throw new EdgeError({
      kind: "not_found",
      message: "Session not found",
      details: { resource: "session" },
      status: 404,
    });
  }

  if (existing.status !== "failed") {
    throw new EdgeError({
      kind: "invalid_input",
      message: `Only failed sessions can be continued (status is "${existing.status}")`,
      details: { issues: [{ path: "status", message: "Session not in failed state" }] },
      status: 400,
    });
  }

  if (auth.kind === "demo") {
    requireCommonsSession(existing);
  }
  await enforceDemoRunLimit(ctx);

  startOrchestration({
    traceId: ctx.traceId,
    sessionId: input.sessionId,
    userId: auth.userId,
    apiKey: auth.openRouterKey,
  });

  return { sessionId: input.sessionId };
}

export async function handleRerunSession(ctx: RequestContext, body: unknown): Promise<Readonly<{ sessionId: number }>> {
  const auth = requireAuth(ctx.auth);
  const input = parseJsonBody(queryRerunBodySchema, body);

  if (auth.kind === "demo") {
    requireCommonsCouncil(input.councilRef);
  }

  const existing = await getSessionById(input.sessionId);
  if (!existing || existing.userId !== auth.userId) {
    throw new EdgeError({
      kind: "not_found",
      message: "Session not found",
      details: { resource: "session" },
      status: 404,
    });
  }

  if (existing.status !== "failed" && existing.status !== "completed") {
    throw new EdgeError({
      kind: "invalid_input",
      message: `Only terminal sessions can be rerun (status is "${existing.status}")`,
      details: { issues: [{ path: "status", message: "Session not in terminal state" }] },
      status: 400,
    });
  }

  await enforceDemoRunLimit(ctx);

  const query = input.queryOverride ?? existing.query;
  const attachments = parseTextAttachmentsJson(existing.attachedFilesMarkdown);

  const run = await buildRunSpecFromCouncil({
    userId: auth.userId,
    councilRef: input.councilRef,
    query,
    attachments,
  });

  const parsedRunSpec = parseSessionRunSpecJson(run.runSpecJson);
  const questionHash = hashQuestion(parsedRunSpec.userMessage);

  const sessionId = await createSession({
    userId: auth.userId,
    query,
    attachedFilesMarkdown: existing.attachedFilesMarkdown,
    councilNameAtRun: run.councilNameAtRun,
    runSpec: run.runSpecJson,
    questionHash,
    ingressSource: ctx.ingress.source,
    ingressVersion: ctx.ingress.version,
    status: "pending",
  });

  startOrchestration({
    traceId: ctx.traceId,
    sessionId,
    userId: auth.userId,
    apiKey: auth.openRouterKey,
  });

  return { sessionId };
}
