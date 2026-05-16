import type { AttachmentText, BillingLookupStatus, SessionSnapshot } from "@the-seven/contracts";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../client";
import { jobs, providerCalls, sessionArtifacts, sessions } from "../schema";
import { type ClaimedJobLease, ClaimedJobLeaseLostError } from "./claimedLease";

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

function requireLeaseSessionMatch(input: { sessionId: number; claimedLease: ClaimedJobLease }) {
  if (input.sessionId !== input.claimedLease.sessionId) {
    throw new ClaimedJobLeaseLostError({
      ...input.claimedLease,
      reason: "session mismatch",
    });
  }
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

export async function getSessionTerminalError(sessionId: number) {
  const db = await getDb();
  const rows = await db
    .select({ terminalError: jobs.lastError })
    .from(jobs)
    .where(eq(jobs.sessionId, sessionId))
    .limit(1);
  return rows[0]?.terminalError ?? null;
}

export async function listSessionsByUserId(userId: number) {
  const db = await getDb();
  return db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt));
}

export async function startClaimedSessionProcessing(input: ClaimedJobLease) {
  const db = await getDb();
  const now = new Date();
  const updated = await db
    .update(sessions)
    .set({
      status: "processing",
      failureKind: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(sessions.id, input.sessionId),
        inArray(sessions.status, ["pending", "failed", "processing"]),
        sql`exists (
          select 1
          from ${jobs}
          where ${jobs.id} = ${input.jobId}
            and ${jobs.sessionId} = ${sessions.id}
            and ${jobs.state} = 'leased'
            and ${jobs.leaseOwner} = ${input.leaseOwner}
            and ${jobs.leaseExpiresAt} > ${now}
        )`,
      ),
    )
    .returning({ id: sessions.id });

  return updated.length > 0;
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
  claimedLease?: ClaimedJobLease;
}) {
  const db = await getDb();
  const values = {
    sessionId: input.sessionId,
    phase: input.phase,
    artifactKind: input.artifactKind,
    memberPosition: input.memberPosition,
    modelId: input.modelId,
    content: input.content,
    tokensUsed: input.tokensUsed ?? null,
    costUsdMicros: input.costUsdMicros ?? null,
  };
  if (!input.claimedLease) {
    await db.insert(sessionArtifacts).values(values).onConflictDoNothing();
    return;
  }

  const claimedLease = input.claimedLease;
  requireLeaseSessionMatch({ sessionId: input.sessionId, claimedLease });
  await db.transaction(async (tx) => {
    const leaseRows = await tx.execute(sql`
      select id
      from ${jobs}
      where id = ${claimedLease.jobId}
        and session_id = ${input.sessionId}
        and state = 'leased'
        and lease_owner = ${claimedLease.leaseOwner}
        and lease_expires_at > ${new Date()}
      for update
    `);
    if (leaseRows.rows.length === 0) {
      throw new ClaimedJobLeaseLostError({
        ...claimedLease,
        reason: "active lease not found",
      });
    }
    await tx.insert(sessionArtifacts).values(values).onConflictDoNothing();
  });
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
  requestMaxOutputTokens: number | null;
  requestSystemChars: number;
  requestUserChars: number;
  requestTotalChars: number;
  catalogRefreshedAt: Date | null;
  supportedParametersJson: string[];
  sentParametersJson: string[];
  sentReasoningEffort: string | null;
  sentProviderRequireParameters: boolean;
  sentProviderIgnoredProvidersJson: string[];
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
  billingLookupStatus: BillingLookupStatus;
  claimedLease?: ClaimedJobLease;
}) {
  const db = await getDb();
  const { claimedLease, ...values } = input;
  if (!claimedLease) {
    await db.insert(providerCalls).values(values);
    return;
  }

  requireLeaseSessionMatch({ sessionId: input.sessionId, claimedLease });
  await db.transaction(async (tx) => {
    const leaseRows = await tx.execute(sql`
      select id
      from ${jobs}
      where id = ${claimedLease.jobId}
        and session_id = ${input.sessionId}
        and state = 'leased'
        and lease_owner = ${claimedLease.leaseOwner}
        and lease_expires_at > ${new Date()}
      for update
    `);
    if (leaseRows.rows.length === 0) {
      throw new ClaimedJobLeaseLostError({
        ...claimedLease,
        reason: "active lease not found",
      });
    }
    await tx.insert(providerCalls).values(values);
  });
}

export async function updateProviderCallCost(
  callId: number,
  totalCostUsdMicros: number,
  billedModelId: string | null,
  billingLookupStatus: BillingLookupStatus = "succeeded",
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

export async function updateProviderCallBillingStatus(
  callId: number,
  billingLookupStatus: BillingLookupStatus,
) {
  const db = await getDb();
  await db.update(providerCalls).set({ billingLookupStatus }).where(eq(providerCalls.id, callId));
}

export async function markSessionPendingBillingFailed(sessionId: number) {
  const db = await getDb();
  const rows = await db.execute(sql`
    update ${providerCalls}
    set billing_lookup_status = 'failed'
    where session_id = ${sessionId}
      and billing_lookup_status = 'pending'
      and response_id is not null
      and exists (
        select 1
        from ${sessions}
        where ${sessions.id} = ${providerCalls.sessionId}
          and ${sessions.status} in ('completed', 'failed')
      )
    returning id
  `);
  await refreshSessionUsageTotals(sessionId);
  return rows.rows.length;
}

export async function listSessionsWithPendingBilling() {
  const db = await getDb();
  const rows = await db
    .select({ sessionId: providerCalls.sessionId })
    .from(providerCalls)
    .innerJoin(sessions, eq(providerCalls.sessionId, sessions.id))
    .where(
      and(
        eq(providerCalls.billingLookupStatus, "pending"),
        sql`${providerCalls.responseId} is not null`,
        inArray(sessions.status, ["completed", "failed"]),
      ),
    )
    .groupBy(providerCalls.sessionId);
  return rows.map((row) => row.sessionId);
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
