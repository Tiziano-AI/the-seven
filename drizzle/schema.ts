import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const NOW_MS = sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`;

function createdAtColumn() {
  return integer("createdAt", { mode: "timestamp_ms" }).notNull().default(NOW_MS);
}

function updatedAtColumn() {
  return integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(NOW_MS);
}

/**
 * Users table - BYOK users store byokId, demo users store email.
 */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["byok", "demo"] }).notNull(),
  byokId: text("byokId"),
  email: text("email"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  uniqueIndex("users_byokId_unique").on(table.byokId),
  uniqueIndex("users_email_unique").on(table.email),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Demo auth links - one-time tokens delivered via email.
 */
export const demoAuthLinks = sqliteTable(
  "demoAuthLinks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("tokenHash").notNull(),
    requestedIp: text("requestedIp").notNull(),
    consumedIp: text("consumedIp"),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("usedAt", { mode: "timestamp_ms" }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("demoAuthLinks_tokenHash_unique").on(table.tokenHash),
    index("demoAuthLinks_userId_createdAt_idx").on(table.userId, table.createdAt),
  ]
);

export type DemoAuthLink = typeof demoAuthLinks.$inferSelect;
export type InsertDemoAuthLink = typeof demoAuthLinks.$inferInsert;

/**
 * Demo sessions - 24h tokens used for API access.
 */
export const demoSessions = sqliteTable(
  "demoSessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("tokenHash").notNull(),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    lastUsedAt: integer("lastUsedAt", { mode: "timestamp_ms" }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("demoSessions_tokenHash_unique").on(table.tokenHash),
    index("demoSessions_userId_createdAt_idx").on(table.userId, table.createdAt),
  ]
);

export type DemoSession = typeof demoSessions.$inferSelect;
export type InsertDemoSession = typeof demoSessions.$inferInsert;

/**
 * Rate limit buckets - fixed-window counters keyed by scope.
 */
export const rateLimitBuckets = sqliteTable(
  "rateLimitBuckets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scope: text("scope").notNull(),
    windowStart: integer("windowStart", { mode: "timestamp_ms" }).notNull(),
    windowSeconds: integer("windowSeconds").notNull(),
    count: integer("count").notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("rateLimitBuckets_scope_window_unique").on(table.scope, table.windowStart),
    index("rateLimitBuckets_scope_idx").on(table.scope),
  ]
);

export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect;
export type InsertRateLimitBucket = typeof rateLimitBuckets.$inferInsert;

/**
 * Councils - a named run configuration (7 member models + phase prompts).
 */
export const councils = sqliteTable(
  "councils",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phase1Prompt: text("phase1Prompt").notNull(),
    phase2Prompt: text("phase2Prompt").notNull(),
    phase3Prompt: text("phase3Prompt").notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("councils_userId_name_unique").on(table.userId, table.name),
    index("councils_userId_createdAt_idx").on(table.userId, table.createdAt),
  ]
);

export type Council = typeof councils.$inferSelect;
export type InsertCouncil = typeof councils.$inferInsert;

/**
 * Council members - stores the provider model assigned to each council slot.
 *
 * memberPosition is 1..7 (mapped to A..G for UI/prompting).
 */
export const councilMembers = sqliteTable(
  "councilMembers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    councilId: integer("councilId")
      .notNull()
      .references(() => councils.id, { onDelete: "cascade" }),
    memberPosition: integer("memberPosition").notNull(),
    provider: text("provider", { enum: ["openrouter"] }).notNull(),
    modelId: text("modelId").notNull(),
    tuningJson: text("tuningJson"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("councilMembers_councilId_memberPosition_unique").on(
      table.councilId,
      table.memberPosition
    ),
    index("councilMembers_councilId_idx").on(table.councilId),
  ]
);

export type CouncilMember = typeof councilMembers.$inferSelect;
export type InsertCouncilMember = typeof councilMembers.$inferInsert;

/**
 * Sessions - stores user queries and orchestration results.
 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    attachedFilesMarkdown: text("attachedFilesMarkdown"),
    councilNameAtRun: text("councilNameAtRun").notNull(),
    runSpec: text("runSpec").notNull(),
    questionHash: text("questionHash").notNull(),
    ingressSource: text("ingressSource").notNull(),
    ingressVersion: text("ingressVersion"),
    status: text("status", { enum: ["pending", "processing", "completed", "failed"] })
      .notNull()
      .default("pending"),
    failureKind: text("failureKind", {
      enum: [
        "server_restart",
        "phase1_inference_failed",
        "phase2_inference_failed",
        "phase3_inference_failed",
        "invalid_run_spec",
        "concurrent_execution",
        "openrouter_rate_limited",
        "internal_error",
      ],
    }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("sessions_userId_createdAt_idx").on(table.userId, table.createdAt),
    index("sessions_status_idx").on(table.status),
    index("sessions_questionHash_idx").on(table.questionHash),
    index("sessions_ingressSource_idx").on(table.ingressSource),
  ]
);

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

/**
 * OpenRouter calls - per-call diagnostics for provider requests.
 *
 * This is intentionally separate from memberResponses/reviews/syntheses:
 * - it records both success and failure metadata,
 * - it records request sizing + provider usage/finish information.
 */
export const openRouterCalls = sqliteTable(
  "openRouterCalls",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("sessionId").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    phase: integer("phase").notNull(), // 1|2|3
    memberPosition: integer("memberPosition").notNull(), // 1..7 (A..G)
    requestModelId: text("requestModelId").notNull(),
    requestSystemChars: integer("requestSystemChars").notNull(),
    requestUserChars: integer("requestUserChars").notNull(),
    requestTotalChars: integer("requestTotalChars").notNull(),
    requestStartedAt: integer("requestStartedAt"),
    responseCompletedAt: integer("responseCompletedAt"),
    latencyMs: integer("latencyMs"),
    responseId: text("responseId"),
    responseModel: text("responseModel"),
    billedModelId: text("billedModelId"),
    totalCostUsdMicros: integer("totalCostUsdMicros"),
    cacheDiscountUsdMicros: integer("cacheDiscountUsdMicros"),
    upstreamInferenceCostUsdMicros: integer("upstreamInferenceCostUsdMicros"),
    nativeTokensPrompt: integer("nativeTokensPrompt"),
    nativeTokensCompletion: integer("nativeTokensCompletion"),
    nativeTokensReasoning: integer("nativeTokensReasoning"),
    numMediaPrompt: integer("numMediaPrompt"),
    numMediaCompletion: integer("numMediaCompletion"),
    numSearchResults: integer("numSearchResults"),
    finishReason: text("finishReason"),
    nativeFinishReason: text("nativeFinishReason"),
    usagePromptTokens: integer("usagePromptTokens"),
    usageCompletionTokens: integer("usageCompletionTokens"),
    usageTotalTokens: integer("usageTotalTokens"),
    choiceErrorCode: integer("choiceErrorCode"),
    choiceErrorMessage: text("choiceErrorMessage"),
    errorStatus: integer("errorStatus"),
    errorMessage: text("errorMessage"),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("openRouterCalls_sessionId_createdAt_idx").on(table.sessionId, table.createdAt),
  ]
);

export type OpenRouterCall = typeof openRouterCalls.$inferSelect;
export type InsertOpenRouterCall = typeof openRouterCalls.$inferInsert;

/**
 * Member responses - stores phase 1 answers for each member slot.
 */
export const memberResponses = sqliteTable(
  "memberResponses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("sessionId").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    memberPosition: integer("memberPosition").notNull(),
    modelId: text("modelId").notNull(),
    response: text("response").notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("memberResponses_sessionId_memberPosition_unique").on(
      table.sessionId,
      table.memberPosition
    ),
  ]
);

export type MemberResponse = typeof memberResponses.$inferSelect;
export type InsertMemberResponse = typeof memberResponses.$inferInsert;

/**
 * Member reviews - stores phase 2 peer reviews (authored by reviewer members).
 */
export const memberReviews = sqliteTable(
  "memberReviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("sessionId").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    reviewerMemberPosition: integer("reviewerMemberPosition").notNull(),
    modelId: text("modelId").notNull(),
    reviewContent: text("reviewContent").notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("memberReviews_sessionId_reviewerMemberPosition_unique").on(
      table.sessionId,
      table.reviewerMemberPosition
    ),
  ]
);

export type MemberReview = typeof memberReviews.$inferSelect;
export type InsertMemberReview = typeof memberReviews.$inferInsert;

/**
 * Member syntheses - stores phase 3 synthesized answer (authored by the synthesizer member).
 */
export const memberSyntheses = sqliteTable(
  "memberSyntheses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("sessionId").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    memberPosition: integer("memberPosition").notNull(),
    modelId: text("modelId").notNull(),
    synthesis: text("synthesis").notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("memberSyntheses_sessionId_memberPosition_unique").on(
      table.sessionId,
      table.memberPosition
    ),
  ]
);

export type MemberSynthesis = typeof memberSyntheses.$inferSelect;
export type InsertMemberSynthesis = typeof memberSyntheses.$inferInsert;

/**
 * Models cache - stores OpenRouter model metadata for validation and autocomplete.
 */
export const modelsCache = sqliteTable("modelsCache", {
  modelId: text("modelId").primaryKey(),
  modelName: text("modelName").notNull(),
  description: text("description"),
  contextLength: integer("contextLength"),
  maxCompletionTokens: integer("maxCompletionTokens"),
  supportedParametersJson: text("supportedParametersJson"),
  inputModalitiesJson: text("inputModalitiesJson"),
  outputModalitiesJson: text("outputModalitiesJson"),
  lastUpdated: integer("lastUpdated", { mode: "timestamp_ms" }).notNull().default(NOW_MS),
  createdAt: createdAtColumn(),
});

export type ModelsCache = typeof modelsCache.$inferSelect;
export type InsertModelsCache = typeof modelsCache.$inferInsert;

/**
 * Pricing cache - stores OpenRouter pricing data to minimize API calls.
 */
export const pricingCache = sqliteTable("pricingCache", {
  modelId: text("modelId")
    .references(() => modelsCache.modelId, { onDelete: "cascade" })
    .primaryKey(),
  promptPrice: text("promptPrice").notNull(),
  completionPrice: text("completionPrice").notNull(),
  requestPrice: text("requestPrice").notNull().default("0"),
  imagePrice: text("imagePrice").notNull().default("0"),
  lastUpdated: integer("lastUpdated", { mode: "timestamp_ms" }).notNull().default(NOW_MS),
  createdAt: createdAtColumn(),
});

export type PricingCache = typeof pricingCache.$inferSelect;
export type InsertPricingCache = typeof pricingCache.$inferInsert;
