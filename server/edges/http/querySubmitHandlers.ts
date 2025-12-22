import { z } from "zod";
import { requireAuth } from "./requireAuth";
import { parseJsonBody } from "./parse";
import type { RequestContext } from "./context";
import { EdgeError } from "./errors";
import { decodeAttachmentToText, type Attachment } from "../../domain/attachments";
import { councilRefSchema } from "../../domain/councilRef";
import { buildRunSpecFromCouncil } from "../../services/sessionRuns";
import { parseSessionRunSpecJson } from "../../domain/sessionRunSpec";
import { orchestrateSession } from "../../workflows/orchestration";
import { createSession, getSessionById } from "../../stores/sessionStore";
import { checkDemoRunLimits } from "../../services/demoRateLimits";
import { parseTextAttachmentsJson } from "./queryAttachments";

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

const submitSchema = z.object({
  query: z.string().min(1),
  councilRef: councilRefSchema,
  attachments: attachmentsInput,
});

const continueSchema = z.object({
  sessionId: z.number().int(),
});

const rerunSchema = z.object({
  sessionId: z.number().int(),
  councilRef: councilRefSchema,
  queryOverride: z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0, "Query must not be blank")
    .optional(),
});

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

function requireCommonsCouncil(ref: z.infer<typeof councilRefSchema>): void {
  if (ref.kind === "built_in" && ref.slug === "commons") return;
  throw new EdgeError({
    kind: "forbidden",
    message: "Demo mode only allows Commons Council",
    details: { reason: "demo_council_only" },
    status: 403,
  });
}

export async function handleQuerySubmit(ctx: RequestContext, body: unknown): Promise<Readonly<{ sessionId: number }>> {
  const auth = requireAuth(ctx.auth);
  const input = parseJsonBody(submitSchema, body);

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

  parseSessionRunSpecJson(run.runSpecJson);

  const sessionId = await createSession({
    userId: auth.userId,
    query: input.query,
    attachedFilesMarkdown: JSON.stringify(decodedAttachments),
    councilNameAtRun: run.councilNameAtRun,
    runSpec: run.runSpecJson,
    status: "pending",
  });

  void orchestrateSession({
    traceId: ctx.traceId,
    sessionId,
    userId: auth.userId,
    apiKey: auth.openRouterKey,
  });

  return { sessionId };
}

export async function handleContinueSession(ctx: RequestContext, body: unknown): Promise<Readonly<{ sessionId: number }>> {
  const auth = requireAuth(ctx.auth);
  const input = parseJsonBody(continueSchema, body);

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

  await enforceDemoRunLimit(ctx);

  void orchestrateSession({
    traceId: ctx.traceId,
    sessionId: input.sessionId,
    userId: auth.userId,
    apiKey: auth.openRouterKey,
  });

  return { sessionId: input.sessionId };
}

export async function handleRerunSession(ctx: RequestContext, body: unknown): Promise<Readonly<{ sessionId: number }>> {
  const auth = requireAuth(ctx.auth);
  const input = parseJsonBody(rerunSchema, body);

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

  parseSessionRunSpecJson(run.runSpecJson);

  const sessionId = await createSession({
    userId: auth.userId,
    query,
    attachedFilesMarkdown: existing.attachedFilesMarkdown,
    councilNameAtRun: run.councilNameAtRun,
    runSpec: run.runSpecJson,
    status: "pending",
  });

  void orchestrateSession({
    traceId: ctx.traceId,
    sessionId,
    userId: auth.userId,
    apiKey: auth.openRouterKey,
  });

  return { sessionId };
}
