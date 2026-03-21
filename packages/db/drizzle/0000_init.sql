DO $$ BEGIN
 CREATE TYPE "public"."artifact_kind" AS ENUM('response', 'review', 'synthesis');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ingress_source" AS ENUM('web', 'cli', 'api');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."job_state" AS ENUM('queued', 'leased', 'completed', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."provider_kind" AS ENUM('openrouter');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."session_failure_kind" AS ENUM(
  'server_restart',
  'phase1_inference_failed',
  'phase2_inference_failed',
  'phase3_inference_failed',
  'invalid_run_spec',
  'concurrent_execution',
  'openrouter_rate_limited',
  'internal_error'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."session_status" AS ENUM('pending', 'processing', 'completed', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."user_kind" AS ENUM('byok', 'demo');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog_cache" (
  "id" serial PRIMARY KEY NOT NULL,
  "model_id" text NOT NULL,
  "model_name" text NOT NULL,
  "description" text NOT NULL,
  "context_length" integer,
  "max_completion_tokens" integer,
  "supported_parameters_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "input_modalities_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "output_modalities_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "pricing_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "refreshed_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "id" serial PRIMARY KEY NOT NULL,
  "scope" text NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "window_seconds" integer NOT NULL,
  "count" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "kind" "user_kind" NOT NULL,
  "byok_id" text,
  "email" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "users_identity_kind_check" CHECK (("users"."kind" = 'byok' and "users"."byok_id" is not null and "users"."email" is null) or ("users"."kind" = 'demo' and "users"."email" is not null and "users"."byok_id" is null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "demo_magic_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token_hash" text NOT NULL,
  "requested_ip" text NOT NULL,
  "consumed_ip" text,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "demo_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "councils" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "phase1_prompt" text NOT NULL,
  "phase2_prompt" text NOT NULL,
  "phase3_prompt" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "council_members" (
  "id" serial PRIMARY KEY NOT NULL,
  "council_id" integer NOT NULL REFERENCES "councils"("id") ON DELETE cascade,
  "member_position" integer NOT NULL,
  "provider" "provider_kind" NOT NULL,
  "model_id" text NOT NULL,
  "tuning_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "council_members_member_position_check" CHECK ("council_members"."member_position" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "query" text NOT NULL,
  "attachments_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "snapshot_json" jsonb NOT NULL,
  "council_name_at_run" text NOT NULL,
  "question_hash" text NOT NULL,
  "ingress_source" "ingress_source" NOT NULL,
  "ingress_version" text,
  "trace_id" text NOT NULL,
  "status" "session_status" DEFAULT 'pending' NOT NULL,
  "failure_kind" "session_failure_kind",
  "total_tokens" integer DEFAULT 0 NOT NULL,
  "total_cost_usd_micros" integer DEFAULT 0 NOT NULL,
  "total_cost_is_partial" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sessions_failure_kind_status_check" CHECK (("sessions"."status" = 'failed' and "sessions"."failure_kind" is not null) or ("sessions"."status" <> 'failed' and "sessions"."failure_kind" is null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_artifacts" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_id" integer NOT NULL REFERENCES "sessions"("id") ON DELETE cascade,
  "phase" integer NOT NULL,
  "artifact_kind" "artifact_kind" NOT NULL,
  "member_position" integer NOT NULL,
  "model_id" text NOT NULL,
  "content" text NOT NULL,
  "tokens_used" integer,
  "cost_usd_micros" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "session_artifacts_member_position_check" CHECK ("session_artifacts"."member_position" between 1 and 7),
  CONSTRAINT "session_artifacts_phase_check" CHECK ("session_artifacts"."phase" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_calls" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_id" integer NOT NULL REFERENCES "sessions"("id") ON DELETE cascade,
  "phase" integer NOT NULL,
  "member_position" integer NOT NULL,
  "request_model_id" text NOT NULL,
  "request_system_chars" integer NOT NULL,
  "request_user_chars" integer NOT NULL,
  "request_total_chars" integer NOT NULL,
  "request_started_at" timestamp with time zone,
  "response_completed_at" timestamp with time zone,
  "latency_ms" integer,
  "response_id" text,
  "response_model" text,
  "billed_model_id" text,
  "total_cost_usd_micros" integer,
  "usage_prompt_tokens" integer,
  "usage_completion_tokens" integer,
  "usage_total_tokens" integer,
  "finish_reason" text,
  "native_finish_reason" text,
  "error_message" text,
  "choice_error_message" text,
  "choice_error_code" integer,
  "error_status" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "provider_calls_member_position_check" CHECK ("provider_calls"."member_position" between 1 and 7),
  CONSTRAINT "provider_calls_phase_check" CHECK ("provider_calls"."phase" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_id" integer NOT NULL REFERENCES "sessions"("id") ON DELETE cascade,
  "state" "job_state" DEFAULT 'queued' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "credential_ciphertext" text,
  "lease_owner" text,
  "lease_expires_at" timestamp with time zone,
  "next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_cache_model_id_unique" ON "catalog_cache" USING btree ("model_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rate_limit_buckets_scope_window_unique" ON "rate_limit_buckets" USING btree ("scope", "window_start");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limit_buckets_scope_idx" ON "rate_limit_buckets" USING btree ("scope");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_byok_id_unique" ON "users" USING btree ("byok_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" USING btree ("email");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "demo_magic_links_token_hash_unique" ON "demo_magic_links" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "demo_magic_links_user_id_created_at_idx" ON "demo_magic_links" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "demo_sessions_token_hash_unique" ON "demo_sessions" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "demo_sessions_user_id_created_at_idx" ON "demo_sessions" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "councils_user_id_name_unique" ON "councils" USING btree ("user_id", "name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "councils_user_id_created_at_idx" ON "councils" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "council_members_council_member_unique" ON "council_members" USING btree ("council_id", "member_position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "council_members_council_id_idx" ON "council_members" USING btree ("council_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_id_created_at_idx" ON "sessions" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_status_idx" ON "sessions" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_question_hash_idx" ON "sessions" USING btree ("question_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "session_artifacts_session_kind_member_unique" ON "session_artifacts" USING btree ("session_id", "artifact_kind", "member_position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_artifacts_session_id_idx" ON "session_artifacts" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_calls_session_id_idx" ON "provider_calls" USING btree ("session_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "jobs_session_id_unique" ON "jobs" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_state_next_run_idx" ON "jobs" USING btree ("state", "next_run_at");
