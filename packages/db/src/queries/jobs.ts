import { JOB_MAX_ATTEMPTS } from "@the-seven/config";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../client";
import { jobs, providerCalls, sessions } from "../schema";
import { type ClaimedJobLease, ClaimedJobLeaseLostError } from "./claimedLease";
import type { SessionFailureKind } from "./sessions";

function requireAffectedRow<T>(rows: ReadonlyArray<T>, label: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(`Expected claimed row for ${label}`);
  }
  return row;
}

export async function requeueFailedSessionJob(input: {
  sessionId: number;
  buildCredentialCiphertext: (context: { sessionId: number; jobId: number }) => string;
}) {
  const db = await getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    const jobRows = await tx
      .insert(jobs)
      .values({
        sessionId: input.sessionId,
        state: "queued",
        attemptCount: 0,
        credentialCiphertext: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextRunAt: now,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: jobs.sessionId,
        set: {
          state: "queued",
          attemptCount: 0,
          credentialCiphertext: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          nextRunAt: now,
          lastError: null,
          updatedAt: now,
        },
      })
      .returning({ id: jobs.id });

    const jobId = requireAffectedRow(jobRows, "jobs.requeue");
    const credentialCiphertext = input.buildCredentialCiphertext({
      sessionId: input.sessionId,
      jobId: jobId.id,
    });

    const credentialRows = await tx
      .update(jobs)
      .set({
        credentialCiphertext,
        updatedAt: now,
      })
      .where(and(eq(jobs.id, jobId.id), eq(jobs.sessionId, input.sessionId)))
      .returning({ id: jobs.id });
    requireAffectedRow(credentialRows, "jobs.requeue_credential");

    const sessionRows = await tx
      .update(sessions)
      .set({
        status: "pending",
        failureKind: null,
        updatedAt: now,
      })
      .where(and(eq(sessions.id, input.sessionId), eq(sessions.status, "failed")))
      .returning({ id: sessions.id });
    requireAffectedRow(sessionRows, "sessions.requeue_failed");
  });
}

export async function claimRunnableJobs(input: {
  leaseOwner: string;
  now: Date;
  leaseExpiresAt: Date;
  limit: number;
}) {
  const db = await getDb();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`
      with exhausted as (
        update jobs
        set
          state = 'failed',
          credential_ciphertext = null,
          lease_owner = null,
          lease_expires_at = null,
          next_run_at = ${input.now},
          last_error = 'Job lease expired after maximum attempts',
          updated_at = ${input.now}
        where state = 'leased'
          and lease_expires_at is not null
          and lease_expires_at <= ${input.now}
          and attempt_count >= ${JOB_MAX_ATTEMPTS}
        returning session_id
      ),
      totals as (
        select
          exhausted.session_id,
          coalesce(sum(provider_calls.usage_total_tokens), 0) as total_tokens,
          coalesce(sum(provider_calls.total_cost_usd_micros), 0) as total_cost_usd_micros,
          coalesce(
            sum(
              case
                when provider_calls.id is not null
                  and provider_calls.total_cost_usd_micros is null
                then 1
                else 0
              end
            ),
            0
          ) as missing_cost_count
        from exhausted
        left join provider_calls on provider_calls.session_id = exhausted.session_id
        group by exhausted.session_id
      )
      update sessions
      set
        status = 'failed',
        failure_kind = 'internal_error',
        total_tokens = totals.total_tokens,
        total_cost_usd_micros = totals.total_cost_usd_micros,
        total_cost_is_partial = totals.missing_cost_count > 0,
        updated_at = ${input.now}
      from totals
      where sessions.id = totals.session_id
        and status <> 'completed'
    `);

    return tx.execute(sql`
      with claimable as (
        select id
        from jobs
        where (
          state = 'queued'
          or (
            state = 'leased'
            and lease_expires_at is not null
            and lease_expires_at <= ${input.now}
            and attempt_count < ${JOB_MAX_ATTEMPTS}
          )
        )
        and credential_ciphertext is not null
        and next_run_at <= ${input.now}
        order by next_run_at asc, id asc
        for update skip locked
        limit ${input.limit}
      )
      update jobs
      set
        state = 'leased',
        lease_owner = ${input.leaseOwner},
        lease_expires_at = ${input.leaseExpiresAt},
        attempt_count = jobs.attempt_count + 1,
        updated_at = ${input.now}
      from claimable
      where jobs.id = claimable.id
      returning jobs.id, jobs.session_id, jobs.attempt_count, jobs.credential_ciphertext, jobs.lease_owner, jobs.lease_expires_at
    `);
  });

  return result.rows.map((row) => ({
    id: Number(row.id),
    sessionId: Number(row.session_id),
    attemptCount: Number(row.attempt_count),
    credentialCiphertext:
      typeof row.credential_ciphertext === "string" ? row.credential_ciphertext : null,
    leaseOwner: String(row.lease_owner),
    leaseExpiresAt: new Date(String(row.lease_expires_at)),
  }));
}

export async function renewJobLease(input: {
  jobId: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
}) {
  const db = await getDb();
  const now = new Date();
  const rows = await db
    .update(jobs)
    .set({
      leaseExpiresAt: input.leaseExpiresAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(jobs.id, input.jobId),
        eq(jobs.state, "leased"),
        eq(jobs.leaseOwner, input.leaseOwner),
        sql`${jobs.leaseExpiresAt} > ${now}`,
      ),
    )
    .returning({ id: jobs.id });
  requireAffectedRow(rows, "jobs.renew_lease");
}

/**
 * Verifies that the caller still owns a non-expired leased job row before it
 * writes workflow side effects outside a claimed terminal transaction.
 */
export async function verifyActiveClaimedJobLease(input: ClaimedJobLease & { now: Date }) {
  const db = await getDb();
  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.id, input.jobId),
        eq(jobs.sessionId, input.sessionId),
        eq(jobs.state, "leased"),
        eq(jobs.leaseOwner, input.leaseOwner),
        sql`${jobs.leaseExpiresAt} > ${input.now}`,
      ),
    )
    .limit(1);

  if (!rows[0]) {
    throw new ClaimedJobLeaseLostError({
      sessionId: input.sessionId,
      jobId: input.jobId,
      leaseOwner: input.leaseOwner,
      reason: "active lease not found",
    });
  }
}

export async function markJobCompleted(input: { jobId: number; leaseOwner: string }) {
  const db = await getDb();
  const now = new Date();
  const rows = await db
    .update(jobs)
    .set({
      state: "completed",
      credentialCiphertext: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: now,
      lastError: null,
    })
    .where(
      and(
        eq(jobs.id, input.jobId),
        eq(jobs.state, "leased"),
        eq(jobs.leaseOwner, input.leaseOwner),
        sql`${jobs.leaseExpiresAt} > ${now}`,
      ),
    )
    .returning({ id: jobs.id });
  requireAffectedRow(rows, "jobs.complete");
}

export async function markJobFailed(input: {
  jobId: number;
  leaseOwner: string;
  lastError: string;
  nextRunAt?: Date;
}) {
  const db = await getDb();
  const now = new Date();
  const rows = await db
    .update(jobs)
    .set({
      state: "failed",
      credentialCiphertext: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: now,
      lastError: input.lastError,
      nextRunAt: input.nextRunAt ?? now,
    })
    .where(
      and(
        eq(jobs.id, input.jobId),
        eq(jobs.state, "leased"),
        eq(jobs.leaseOwner, input.leaseOwner),
        sql`${jobs.leaseExpiresAt} > ${now}`,
      ),
    )
    .returning({ id: jobs.id });
  requireAffectedRow(rows, "jobs.fail");
}

export async function markClaimedSessionCompleted(input: {
  sessionId: number;
  jobId: number;
  leaseOwner: string;
}) {
  const db = await getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    const jobRows = await tx
      .update(jobs)
      .set({
        state: "completed",
        credentialCiphertext: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: now,
        lastError: null,
      })
      .where(
        and(
          eq(jobs.id, input.jobId),
          eq(jobs.sessionId, input.sessionId),
          eq(jobs.state, "leased"),
          eq(jobs.leaseOwner, input.leaseOwner),
          sql`${jobs.leaseExpiresAt} > ${now}`,
        ),
      )
      .returning({ id: jobs.id });
    requireAffectedRow(jobRows, "jobs.complete_claimed");

    const totalRows = await tx
      .select({
        totalTokens: sql<number>`coalesce(sum(${providerCalls.usageTotalTokens}), 0)`,
        totalCostUsdMicros: sql<number>`coalesce(sum(${providerCalls.totalCostUsdMicros}), 0)`,
        missingCostCount: sql<number>`coalesce(sum(case when ${providerCalls.totalCostUsdMicros} is null then 1 else 0 end), 0)`,
      })
      .from(providerCalls)
      .where(eq(providerCalls.sessionId, input.sessionId));
    const totals = requireAffectedRow(totalRows, "provider_calls.totals");

    const sessionRows = await tx
      .update(sessions)
      .set({
        status: "completed",
        failureKind: null,
        totalTokens: Number(totals.totalTokens ?? 0),
        totalCostUsdMicros: Number(totals.totalCostUsdMicros ?? 0),
        totalCostIsPartial: Number(totals.missingCostCount ?? 0) > 0,
        updatedAt: now,
      })
      .where(eq(sessions.id, input.sessionId))
      .returning({ id: sessions.id });
    requireAffectedRow(sessionRows, "sessions.complete_claimed");
  });
}

export async function markClaimedSessionFailed(input: {
  sessionId: number;
  jobId: number;
  leaseOwner: string;
  failureKind: SessionFailureKind;
  lastError: string;
}) {
  const db = await getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    const jobRows = await tx
      .update(jobs)
      .set({
        state: "failed",
        credentialCiphertext: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: now,
        lastError: input.lastError,
        nextRunAt: now,
      })
      .where(
        and(
          eq(jobs.id, input.jobId),
          eq(jobs.sessionId, input.sessionId),
          eq(jobs.state, "leased"),
          eq(jobs.leaseOwner, input.leaseOwner),
          sql`${jobs.leaseExpiresAt} > ${now}`,
        ),
      )
      .returning({ id: jobs.id });
    requireAffectedRow(jobRows, "jobs.fail_claimed");

    const totalRows = await tx
      .select({
        totalTokens: sql<number>`coalesce(sum(${providerCalls.usageTotalTokens}), 0)`,
        totalCostUsdMicros: sql<number>`coalesce(sum(${providerCalls.totalCostUsdMicros}), 0)`,
        missingCostCount: sql<number>`coalesce(sum(case when ${providerCalls.totalCostUsdMicros} is null then 1 else 0 end), 0)`,
      })
      .from(providerCalls)
      .where(eq(providerCalls.sessionId, input.sessionId));
    const totals = requireAffectedRow(totalRows, "provider_calls.totals");

    const sessionRows = await tx
      .update(sessions)
      .set({
        status: "failed",
        failureKind: input.failureKind,
        totalTokens: Number(totals.totalTokens ?? 0),
        totalCostUsdMicros: Number(totals.totalCostUsdMicros ?? 0),
        totalCostIsPartial: Number(totals.missingCostCount ?? 0) > 0,
        updatedAt: now,
      })
      .where(eq(sessions.id, input.sessionId))
      .returning({ id: sessions.id });
    requireAffectedRow(sessionRows, "sessions.fail_claimed");
  });
}
