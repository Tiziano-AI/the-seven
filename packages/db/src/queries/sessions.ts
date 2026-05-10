import type { AttachmentText, SessionSnapshot } from "@the-seven/contracts";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../client";
import { jobs, providerCalls, sessionArtifacts, sessions } from "../schema";

export type SessionFailureKind =
  | "server_restart"
  | "phase1_inference_failed"
  | "phase2_inference_failed"
  | "phase3_inference_failed"
  | "invalid_run_spec"
  | "concurrent_execution"
  | "openrouter_rate_limited"
  | "internal_error";

function requireRow<T>(rows: ReadonlyArray<T>, label: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(`Expected row for ${label}`);
  }
  return row;
}

export async function createSessionWithJob(input: {
  userId: number;
  query: string;
  attachments: ReadonlyArray<AttachmentText>;
  snapshot: SessionSnapshot;
  councilNameAtRun: string;
  questionHash: string;
  ingressSource: "web" | "cli" | "api";
  ingressVersion: string | null;
  traceId: string;
  buildCredentialCiphertext: (context: { sessionId: number; jobId: number }) => string;
}) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(sessions)
      .values({
        userId: input.userId,
        query: input.query,
        attachmentsJson: input.attachments,
        snapshotJson: input.snapshot,
        councilNameAtRun: input.councilNameAtRun,
        questionHash: input.questionHash,
        ingressSource: input.ingressSource,
        ingressVersion: input.ingressVersion,
        traceId: input.traceId,
        status: "pending",
      })
      .returning({ id: sessions.id });

    const sessionId = requireRow(inserted, "sessions").id;

    const insertedJob = await tx
      .insert(jobs)
      .values({
        sessionId,
        state: "queued",
        attemptCount: 0,
        credentialCiphertext: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextRunAt: new Date(),
        lastError: null,
      })
      .returning({ id: jobs.id });

    const jobId = requireRow(insertedJob, "jobs").id;
    await tx
      .update(jobs)
      .set({
        credentialCiphertext: input.buildCredentialCiphertext({ sessionId, jobId }),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    return sessionId;
  });
}

export async function getSessionById(sessionId: number) {
  const db = await getDb();
  const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  return rows[0] ?? null;
}

export async function listSessionsByUserId(userId: number) {
  const db = await getDb();
  return db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt));
}

export async function setSessionPending(sessionId: number) {
  const db = await getDb();
  await db
    .update(sessions)
    .set({
      status: "pending",
      failureKind: null,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));
}

export async function startSessionProcessing(sessionId: number) {
  const db = await getDb();
  const updated = await db
    .update(sessions)
    .set({
      status: "processing",
      failureKind: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sessions.id, sessionId),
        inArray(sessions.status, ["pending", "failed", "processing"]),
      ),
    )
    .returning({ id: sessions.id });

  return updated.length > 0;
}

export async function markSessionCompleted(sessionId: number) {
  const db = await getDb();
  await db
    .update(sessions)
    .set({
      status: "completed",
      failureKind: null,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));
}

export async function markSessionFailed(sessionId: number, failureKind: SessionFailureKind) {
  const db = await getDb();
  await db
    .update(sessions)
    .set({
      status: "failed",
      failureKind,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));
}

export async function listSessionArtifacts(sessionId: number) {
  const db = await getDb();
  return db
    .select()
    .from(sessionArtifacts)
    .where(eq(sessionArtifacts.sessionId, sessionId))
    .orderBy(asc(sessionArtifacts.phase), asc(sessionArtifacts.memberPosition));
}

export async function createSessionArtifact(input: {
  sessionId: number;
  phase: number;
  artifactKind: "response" | "review" | "synthesis";
  memberPosition: number;
  modelId: string;
  content: string;
  tokensUsed?: number | null;
  costUsdMicros?: number | null;
}) {
  const db = await getDb();
  await db
    .insert(sessionArtifacts)
    .values({
      sessionId: input.sessionId,
      phase: input.phase,
      artifactKind: input.artifactKind,
      memberPosition: input.memberPosition,
      modelId: input.modelId,
      content: input.content,
      tokensUsed: input.tokensUsed ?? null,
      costUsdMicros: input.costUsdMicros ?? null,
    })
    .onConflictDoNothing();
}

export async function getSessionArtifact(input: {
  sessionId: number;
  artifactKind: "response" | "review" | "synthesis";
  memberPosition: number;
}) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(sessionArtifacts)
    .where(
      and(
        eq(sessionArtifacts.sessionId, input.sessionId),
        eq(sessionArtifacts.artifactKind, input.artifactKind),
        eq(sessionArtifacts.memberPosition, input.memberPosition),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function createProviderCall(input: {
  sessionId: number;
  phase: number;
  memberPosition: number;
  requestModelId: string;
  requestSystemChars: number;
  requestUserChars: number;
  requestTotalChars: number;
  catalogRefreshedAt: Date | null;
  supportedParametersJson: string[];
  sentParametersJson: string[];
  deniedParametersJson: string[];
  requestStartedAt: Date | null;
  responseCompletedAt: Date | null;
  latencyMs: number | null;
  responseId: string | null;
  responseModel: string | null;
  billedModelId: string | null;
  totalCostUsdMicros: number | null;
  usagePromptTokens: number | null;
  usageCompletionTokens: number | null;
  usageTotalTokens: number | null;
  finishReason: string | null;
  nativeFinishReason: string | null;
  errorMessage: string | null;
  choiceErrorMessage: string | null;
  choiceErrorCode: number | null;
  errorStatus: number | null;
  errorCode: string | null;
  billingLookupStatus: string;
}) {
  const db = await getDb();
  await db.insert(providerCalls).values(input);
}

export async function updateProviderCallCost(
  callId: number,
  totalCostUsdMicros: number,
  billedModelId: string | null,
  billingLookupStatus = "succeeded",
) {
  const db = await getDb();
  await db
    .update(providerCalls)
    .set({
      totalCostUsdMicros,
      billingLookupStatus,
      ...(billedModelId !== null ? { billedModelId } : {}),
    })
    .where(eq(providerCalls.id, callId));
}

export async function listProviderCalls(sessionId: number) {
  const db = await getDb();
  return db
    .select()
    .from(providerCalls)
    .where(eq(providerCalls.sessionId, sessionId))
    .orderBy(asc(providerCalls.createdAt));
}

export async function refreshSessionUsageTotals(sessionId: number) {
  const db = await getDb();
  const rows = await db
    .select({
      totalTokens: sql<number>`coalesce(sum(${providerCalls.usageTotalTokens}), 0)`,
      totalCostUsdMicros: sql<number>`coalesce(sum(${providerCalls.totalCostUsdMicros}), 0)`,
      missingCostCount: sql<number>`coalesce(sum(case when ${providerCalls.totalCostUsdMicros} is null then 1 else 0 end), 0)`,
    })
    .from(providerCalls)
    .where(eq(providerCalls.sessionId, sessionId));

  const totals = requireRow(rows, "provider_calls.totals");
  await db
    .update(sessions)
    .set({
      totalTokens: Number(totals.totalTokens ?? 0),
      totalCostUsdMicros: Number(totals.totalCostUsdMicros ?? 0),
      totalCostIsPartial: Number(totals.missingCostCount ?? 0) > 0,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));
}
