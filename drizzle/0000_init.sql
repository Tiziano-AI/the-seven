CREATE TABLE "users" (
  "id" integer PRIMARY KEY AUTOINCREMENT,
  "kind" text NOT NULL CHECK ("kind" IN ('byok', 'demo')),
  "byokId" text,
  "email" text,
  "createdAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  "updatedAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_byokId_unique" ON "users" ("byokId");
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" ("email");
--> statement-breakpoint
CREATE TABLE "demoAuthLinks" (
  "id" integer PRIMARY KEY AUTOINCREMENT,
  "userId" integer NOT NULL,
  "tokenHash" text NOT NULL,
  "requestedIp" text NOT NULL,
  "consumedIp" text,
  "expiresAt" integer NOT NULL,
  "usedAt" integer,
  "createdAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "demoAuthLinks_tokenHash_unique" ON "demoAuthLinks" ("tokenHash");
--> statement-breakpoint
CREATE INDEX "demoAuthLinks_userId_createdAt_idx" ON "demoAuthLinks" ("userId", "createdAt");
--> statement-breakpoint
CREATE TABLE "demoSessions" (
  "id" integer PRIMARY KEY AUTOINCREMENT,
  "userId" integer NOT NULL,
  "tokenHash" text NOT NULL,
  "expiresAt" integer NOT NULL,
  "lastUsedAt" integer,
  "createdAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "demoSessions_tokenHash_unique" ON "demoSessions" ("tokenHash");
--> statement-breakpoint
CREATE INDEX "demoSessions_userId_createdAt_idx" ON "demoSessions" ("userId", "createdAt");
--> statement-breakpoint
CREATE TABLE "rateLimitBuckets" (
  "id" integer PRIMARY KEY AUTOINCREMENT,
  "scope" text NOT NULL,
  "windowStart" integer NOT NULL,
  "windowSeconds" integer NOT NULL,
  "count" integer NOT NULL,
  "createdAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  "updatedAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rateLimitBuckets_scope_window_unique" ON "rateLimitBuckets" ("scope", "windowStart");
--> statement-breakpoint
CREATE INDEX "rateLimitBuckets_scope_idx" ON "rateLimitBuckets" ("scope");
--> statement-breakpoint
CREATE TABLE "councils" (
  "id" integer PRIMARY KEY AUTOINCREMENT,
  "userId" integer NOT NULL,
  "name" text NOT NULL,
  "phase1Prompt" text NOT NULL,
  "phase2Prompt" text NOT NULL,
  "phase3Prompt" text NOT NULL,
  "createdAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  "updatedAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "councils_userId_name_unique" ON "councils" ("userId", "name");
--> statement-breakpoint
CREATE INDEX "councils_userId_createdAt_idx" ON "councils" ("userId", "createdAt");
--> statement-breakpoint
CREATE TABLE "councilMembers" (
  "id" integer PRIMARY KEY AUTOINCREMENT,
  "councilId" integer NOT NULL,
  "memberPosition" integer NOT NULL,
  "provider" text NOT NULL CHECK ("provider" IN ('openrouter')),
  "modelId" text NOT NULL,
  "tuningJson" text,
  "createdAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  "updatedAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  FOREIGN KEY ("councilId") REFERENCES "councils" ("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "councilMembers_councilId_memberPosition_unique" ON "councilMembers" ("councilId", "memberPosition");
--> statement-breakpoint
CREATE INDEX "councilMembers_councilId_idx" ON "councilMembers" ("councilId");
--> statement-breakpoint
CREATE TABLE "sessions" (
  "id" integer PRIMARY KEY AUTOINCREMENT,
  "userId" integer NOT NULL,
  "query" text NOT NULL,
  "attachedFilesMarkdown" text,
  "councilNameAtRun" text NOT NULL,
  "runSpec" text NOT NULL,
  "questionHash" text NOT NULL,
  "ingressSource" text NOT NULL,
  "ingressVersion" text,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'processing', 'completed', 'failed')),
  "failureKind" text CHECK ("failureKind" IN (
    'server_restart',
    'phase1_inference_failed',
    'phase2_inference_failed',
    'phase3_inference_failed',
    'invalid_run_spec',
    'concurrent_execution',
    'internal_error'
  )),
  "createdAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  "updatedAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "sessions_userId_createdAt_idx" ON "sessions" ("userId", "createdAt");
--> statement-breakpoint
CREATE INDEX "sessions_status_idx" ON "sessions" ("status");
--> statement-breakpoint
CREATE INDEX "sessions_questionHash_idx" ON "sessions" ("questionHash");
--> statement-breakpoint
CREATE INDEX "sessions_ingressSource_idx" ON "sessions" ("ingressSource");
--> statement-breakpoint
CREATE TABLE "openRouterCalls" (
  "id" integer PRIMARY KEY AUTOINCREMENT,
  "sessionId" integer NOT NULL,
  "phase" integer NOT NULL,
  "memberPosition" integer NOT NULL,
  "requestModelId" text NOT NULL,
  "requestSystemChars" integer NOT NULL,
  "requestUserChars" integer NOT NULL,
  "requestTotalChars" integer NOT NULL,
  "requestStartedAt" integer,
  "responseCompletedAt" integer,
  "latencyMs" integer,
  "responseId" text,
  "responseModel" text,
  "billedModelId" text,
  "totalCostUsdMicros" integer,
  "cacheDiscountUsdMicros" integer,
  "upstreamInferenceCostUsdMicros" integer,
  "nativeTokensPrompt" integer,
  "nativeTokensCompletion" integer,
  "nativeTokensReasoning" integer,
  "numMediaPrompt" integer,
  "numMediaCompletion" integer,
  "numSearchResults" integer,
  "finishReason" text,
  "nativeFinishReason" text,
  "usagePromptTokens" integer,
  "usageCompletionTokens" integer,
  "usageTotalTokens" integer,
  "choiceErrorCode" integer,
  "choiceErrorMessage" text,
  "errorStatus" integer,
  "errorMessage" text,
  "createdAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "openRouterCalls_sessionId_createdAt_idx" ON "openRouterCalls" ("sessionId", "createdAt");
--> statement-breakpoint
CREATE TABLE "memberResponses" (
  "id" integer PRIMARY KEY AUTOINCREMENT,
  "sessionId" integer NOT NULL,
  "memberPosition" integer NOT NULL,
  "modelId" text NOT NULL,
  "response" text NOT NULL,
  "createdAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "memberResponses_sessionId_memberPosition_unique" ON "memberResponses" ("sessionId", "memberPosition");
--> statement-breakpoint
CREATE TABLE "memberReviews" (
  "id" integer PRIMARY KEY AUTOINCREMENT,
  "sessionId" integer NOT NULL,
  "reviewerMemberPosition" integer NOT NULL,
  "modelId" text NOT NULL,
  "reviewContent" text NOT NULL,
  "createdAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "memberReviews_sessionId_reviewerMemberPosition_unique" ON "memberReviews" ("sessionId", "reviewerMemberPosition");
--> statement-breakpoint
CREATE TABLE "memberSyntheses" (
  "id" integer PRIMARY KEY AUTOINCREMENT,
  "sessionId" integer NOT NULL,
  "memberPosition" integer NOT NULL,
  "modelId" text NOT NULL,
  "synthesis" text NOT NULL,
  "createdAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "memberSyntheses_sessionId_memberPosition_unique" ON "memberSyntheses" ("sessionId", "memberPosition");
--> statement-breakpoint
CREATE TABLE "modelsCache" (
  "modelId" text PRIMARY KEY,
  "modelName" text NOT NULL,
  "description" text,
  "contextLength" integer,
  "maxCompletionTokens" integer,
  "supportedParametersJson" text,
  "inputModalitiesJson" text,
  "outputModalitiesJson" text,
  "lastUpdated" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  "createdAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
);
--> statement-breakpoint
CREATE TABLE "pricingCache" (
  "modelId" text PRIMARY KEY,
  "promptPrice" text NOT NULL,
  "completionPrice" text NOT NULL,
  "requestPrice" text NOT NULL DEFAULT '0',
  "imagePrice" text NOT NULL DEFAULT '0',
  "lastUpdated" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  "createdAt" integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  FOREIGN KEY ("modelId") REFERENCES "modelsCache" ("modelId") ON DELETE CASCADE
);
