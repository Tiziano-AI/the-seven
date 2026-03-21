import type { SessionSnapshot } from "@the-seven/contracts";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const USER_KINDS = ["byok", "demo"] as const;
const SESSION_STATUSES = ["pending", "processing", "completed", "failed"] as const;
const SESSION_FAILURE_KINDS = [
  "server_restart",
  "phase1_inference_failed",
  "phase2_inference_failed",
  "phase3_inference_failed",
  "invalid_run_spec",
  "concurrent_execution",
  "openrouter_rate_limited",
  "internal_error",
] as const;
const JOB_STATES = ["queued", "leased", "completed", "failed"] as const;
const ARTIFACT_KINDS = ["response", "review", "synthesis"] as const;
const INGRESS_SOURCES = ["web", "cli", "api"] as const;
const PROVIDERS = ["openrouter"] as const;

export const userKindEnum = pgEnum("user_kind", USER_KINDS);
export const sessionStatusEnum = pgEnum("session_status", SESSION_STATUSES);
export const sessionFailureKindEnum = pgEnum("session_failure_kind", SESSION_FAILURE_KINDS);
export const jobStateEnum = pgEnum("job_state", JOB_STATES);
export const artifactKindEnum = pgEnum("artifact_kind", ARTIFACT_KINDS);
export const ingressSourceEnum = pgEnum("ingress_source", INGRESS_SOURCES);
export const providerEnum = pgEnum("provider_kind", PROVIDERS);

function createdAtColumn(name = "created_at") {
  return timestamp(name, { withTimezone: true, mode: "date" }).notNull().defaultNow();
}

function updatedAtColumn(name = "updated_at") {
  return timestamp(name, { withTimezone: true, mode: "date" }).notNull().defaultNow();
}

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    kind: userKindEnum("kind").notNull(),
    byokId: text("byok_id"),
    email: text("email"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("users_byok_id_unique").on(table.byokId),
    uniqueIndex("users_email_unique").on(table.email),
    check(
      "users_identity_kind_check",
      sql`(${table.kind} = 'byok' and ${table.byokId} is not null and ${table.email} is null) or (${table.kind} = 'demo' and ${table.email} is not null and ${table.byokId} is null)`,
    ),
  ],
);

export const demoMagicLinks = pgTable(
  "demo_magic_links",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    requestedIp: text("requested_ip").notNull(),
    consumedIp: text("consumed_ip"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("demo_magic_links_token_hash_unique").on(table.tokenHash),
    index("demo_magic_links_user_id_created_at_idx").on(table.userId, table.createdAt),
  ],
);

export const demoSessions = pgTable(
  "demo_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("demo_sessions_token_hash_unique").on(table.tokenHash),
    index("demo_sessions_user_id_created_at_idx").on(table.userId, table.createdAt),
  ],
);

export const councils = pgTable(
  "councils",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phase1Prompt: text("phase1_prompt").notNull(),
    phase2Prompt: text("phase2_prompt").notNull(),
    phase3Prompt: text("phase3_prompt").notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("councils_user_id_name_unique").on(table.userId, table.name),
    index("councils_user_id_created_at_idx").on(table.userId, table.createdAt),
  ],
);

export const councilMembers = pgTable(
  "council_members",
  {
    id: serial("id").primaryKey(),
    councilId: integer("council_id")
      .notNull()
      .references(() => councils.id, { onDelete: "cascade" }),
    memberPosition: integer("member_position").notNull(),
    provider: providerEnum("provider").notNull(),
    modelId: text("model_id").notNull(),
    tuningJson: jsonb("tuning_json"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("council_members_council_member_unique").on(table.councilId, table.memberPosition),
    index("council_members_council_id_idx").on(table.councilId),
    check("council_members_member_position_check", sql`${table.memberPosition} between 1 and 7`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    attachmentsJson: jsonb("attachments_json").notNull().default(sql`'[]'::jsonb`),
    snapshotJson: jsonb("snapshot_json").$type<SessionSnapshot>().notNull(),
    councilNameAtRun: text("council_name_at_run").notNull(),
    questionHash: text("question_hash").notNull(),
    ingressSource: ingressSourceEnum("ingress_source").notNull(),
    ingressVersion: text("ingress_version"),
    traceId: text("trace_id").notNull(),
    status: sessionStatusEnum("status").notNull().default("pending"),
    failureKind: sessionFailureKindEnum("failure_kind"),
    totalTokens: integer("total_tokens").notNull().default(0),
    totalCostUsdMicros: integer("total_cost_usd_micros").notNull().default(0),
    totalCostIsPartial: boolean("total_cost_is_partial").notNull().default(false),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("sessions_user_id_created_at_idx").on(table.userId, table.createdAt),
    index("sessions_status_idx").on(table.status),
    index("sessions_question_hash_idx").on(table.questionHash),
    check(
      "sessions_failure_kind_status_check",
      sql`(${table.status} = 'failed' and ${table.failureKind} is not null) or (${table.status} <> 'failed' and ${table.failureKind} is null)`,
    ),
  ],
);

export const sessionArtifacts = pgTable(
  "session_artifacts",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    phase: integer("phase").notNull(),
    artifactKind: artifactKindEnum("artifact_kind").notNull(),
    memberPosition: integer("member_position").notNull(),
    modelId: text("model_id").notNull(),
    content: text("content").notNull(),
    tokensUsed: integer("tokens_used"),
    costUsdMicros: integer("cost_usd_micros"),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("session_artifacts_session_kind_member_unique").on(
      table.sessionId,
      table.artifactKind,
      table.memberPosition,
    ),
    index("session_artifacts_session_id_idx").on(table.sessionId),
    check("session_artifacts_member_position_check", sql`${table.memberPosition} between 1 and 7`),
    check("session_artifacts_phase_check", sql`${table.phase} between 1 and 3`),
  ],
);

export const providerCalls = pgTable(
  "provider_calls",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    phase: integer("phase").notNull(),
    memberPosition: integer("member_position").notNull(),
    requestModelId: text("request_model_id").notNull(),
    requestSystemChars: integer("request_system_chars").notNull(),
    requestUserChars: integer("request_user_chars").notNull(),
    requestTotalChars: integer("request_total_chars").notNull(),
    requestStartedAt: timestamp("request_started_at", { withTimezone: true, mode: "date" }),
    responseCompletedAt: timestamp("response_completed_at", { withTimezone: true, mode: "date" }),
    latencyMs: integer("latency_ms"),
    responseId: text("response_id"),
    responseModel: text("response_model"),
    billedModelId: text("billed_model_id"),
    totalCostUsdMicros: integer("total_cost_usd_micros"),
    usagePromptTokens: integer("usage_prompt_tokens"),
    usageCompletionTokens: integer("usage_completion_tokens"),
    usageTotalTokens: integer("usage_total_tokens"),
    finishReason: text("finish_reason"),
    nativeFinishReason: text("native_finish_reason"),
    errorMessage: text("error_message"),
    choiceErrorMessage: text("choice_error_message"),
    choiceErrorCode: integer("choice_error_code"),
    errorStatus: integer("error_status"),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("provider_calls_session_id_idx").on(table.sessionId),
    check("provider_calls_member_position_check", sql`${table.memberPosition} between 1 and 7`),
    check("provider_calls_phase_check", sql`${table.phase} between 1 and 3`),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    state: jobStateEnum("state").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    credentialCiphertext: text("credential_ciphertext"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    lastError: text("last_error"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("jobs_session_id_unique").on(table.sessionId),
    index("jobs_state_next_run_idx").on(table.state, table.nextRunAt),
  ],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    id: serial("id").primaryKey(),
    scope: text("scope").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
    windowSeconds: integer("window_seconds").notNull(),
    count: integer("count").notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("rate_limit_buckets_scope_window_unique").on(table.scope, table.windowStart),
    index("rate_limit_buckets_scope_idx").on(table.scope),
  ],
);

export const catalogCache = pgTable(
  "catalog_cache",
  {
    id: serial("id").primaryKey(),
    modelId: text("model_id").notNull(),
    modelName: text("model_name").notNull(),
    description: text("description").notNull(),
    contextLength: integer("context_length"),
    maxCompletionTokens: integer("max_completion_tokens"),
    supportedParametersJson: jsonb("supported_parameters_json").notNull().default(sql`'[]'::jsonb`),
    inputModalitiesJson: jsonb("input_modalities_json").notNull().default(sql`'[]'::jsonb`),
    outputModalitiesJson: jsonb("output_modalities_json").notNull().default(sql`'[]'::jsonb`),
    pricingJson: jsonb("pricing_json").notNull().default(sql`'{}'::jsonb`),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [uniqueIndex("catalog_cache_model_id_unique").on(table.modelId)],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SessionArtifact = typeof sessionArtifacts.$inferSelect;
export type ProviderCall = typeof providerCalls.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Council = typeof councils.$inferSelect;
export type CouncilMember = typeof councilMembers.$inferSelect;
export type CatalogCacheEntry = typeof catalogCache.$inferSelect;
