import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../client";
import { jobs } from "../schema";

export async function enqueueSessionJob(input: {
  sessionId: number;
  buildCredentialCiphertext: (context: { sessionId: number; jobId: number }) => string;
}) {
  const db = await getDb();
  const now = new Date();
  const rows = await db
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
        credentialCiphertext: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextRunAt: now,
        lastError: null,
        updatedAt: now,
      },
    })
    .returning({ id: jobs.id });

  const jobId = rows[0]?.id;
  if (!jobId) {
    throw new Error("Expected job row for enqueue");
  }

  await db
    .update(jobs)
    .set({
      credentialCiphertext: input.buildCredentialCiphertext({
        sessionId: input.sessionId,
        jobId,
      }),
      updatedAt: now,
    })
    .where(eq(jobs.id, jobId));
}

export async function claimRunnableJobs(input: {
  leaseOwner: string;
  now: Date;
  leaseExpiresAt: Date;
  limit: number;
}) {
  const db = await getDb();
  const result = await db.execute(sql`
    with claimable as (
      select id
      from jobs
      where (
        state = 'queued'
        or (state = 'leased' and lease_expires_at is not null and lease_expires_at <= ${input.now})
      )
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
  await db
    .update(jobs)
    .set({
      leaseExpiresAt: input.leaseExpiresAt,
      updatedAt: new Date(),
    })
    .where(and(eq(jobs.id, input.jobId), eq(jobs.leaseOwner, input.leaseOwner)));
}

export async function markJobCompleted(input: { jobId: number; leaseOwner: string }) {
  const db = await getDb();
  await db
    .update(jobs)
    .set({
      state: "completed",
      credentialCiphertext: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
      lastError: null,
    })
    .where(and(eq(jobs.id, input.jobId), eq(jobs.leaseOwner, input.leaseOwner)));
}

export async function markJobFailed(input: {
  jobId: number;
  leaseOwner: string;
  lastError: string;
  nextRunAt?: Date;
}) {
  const db = await getDb();
  await db
    .update(jobs)
    .set({
      state: "failed",
      credentialCiphertext: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
      lastError: input.lastError,
      nextRunAt: input.nextRunAt ?? new Date(),
    })
    .where(and(eq(jobs.id, input.jobId), eq(jobs.leaseOwner, input.leaseOwner)));
}
