# Architecture (Canonical)

Intentionally opinionated architecture emphasizing security (BYOK + demo identity), determinism (snapshot-based runs), and observability.

## Product Posture (Non‑Negotiables)

### BYOK identity + no server key storage

- The browser stores the OpenRouter key **locally**, encrypted with a **user password**.
- The server **may receive** the OpenRouter API key transiently (per request) to run background orchestration, but the server must **never store** it (DB, logs, analytics, crash dumps).
- The system has an “account” concept without accounts: **BYOK is the identity**.
  - Returning with the same OpenRouter key yields the same stored councils/history.
  - The server stores **only a non-reversible identifier** derived from the key.

### Demo identity + server-owned key

- Demo mode is **email-based**: users request a magic link; no password or account setup.
- Demo sessions are **time-boxed** (24h) and scoped to a server-issued token.
- The server uses **our** OpenRouter API key for demo runs and never stores user keys.
- Demo users can **only** run the Commons Council; councils and models are not editable in demo mode.

### Server role: orchestration + storage

- The server runs and stores:
  - user councils (run configurations: member models + phase prompts),
  - session history and orchestration artifacts (responses/reviews/synthesis),
  - cost accounting metadata.

#### Councils semantics (factory templates + user councils)

- A **Council** is the canonical run configuration object in this repo.
- A council contains:
  - **7 fixed member slots** `A–G`, each assigned exactly one provider model,
  - **phase prompts** (Phase 1, Phase 2, Phase 3) shared by all members who participate in that phase.
- Three councils ship as **built-in templates** in the repo and are immutable:
  - **The Founding Council**: frontier SOTA models (GPT-5.2, Claude Opus 4.5, Gemini 3 Pro, etc.). GPT-5.2 Pro synthesizes.
  - **The Lantern Council**: fast mid-tier models for rapid iteration. Gemini 3 Flash synthesizes.
  - **The Commons Council**: free-tier models only (zero cost). DeepSeek R1 0528 synthesizes.
  - Users can **Duplicate** a built-in council to create an editable copy.
- Runs are launched with an explicit council selection (no “active council” default).
- Sessions snapshot the council **name-at-run** and council **composition/prompts** in `runSpec` for historical inspection.
  - Sessions do **not** link back to the live council for provenance or rerun semantics.

#### Seven member identity (canonical vocabulary)

The Seven has 7 fixed **members** (slots), stored as `memberPosition`:

- Members `A..F` (`memberPosition 1..6`): role `reviewer` (Phase 1 replies + Phase 2 critique).
- Member `G` (`memberPosition 7`): role `synthesizer` (Phase 3 verdict).

The word “model” refers only to provider models (OpenRouter `modelId` / `modelName`), never a member slot.

Prompt posture:

- There are **no per-member prompt overrides**.
- Phase prompts are authored at the council level and apply uniformly:
  - Phase 1 prompt applies to members `A..F`,
  - Phase 2 prompt applies to members `A..F`,
  - Phase 3 prompt applies to member `G`.
- Output-format instructions are repo-controlled (`config/prompts.json`) and are appended to the phase prompt when building the system prompt.

Member tuning posture:

- A council member may optionally specify **model tuning** (request parameters) that affect the model’s generation behavior.
- Tuning is always applied **per member**, not per phase, and is part of the council definition.
- Sessions snapshot the council’s member tuning into `runSpec` so historical runs remain inspectable and deterministic.
- Tuning values are validated structurally (types, single-line strings) but **not** range-clamped: provider-side validation is the source of truth.
- The server never silently clamps, truncates, or drops user-set tuning parameters:
  - unsupported parameters are rejected at preflight when the OpenRouter catalog advertises support metadata,
  - otherwise OpenRouter/provider rejection fails the run (and the failure is surfaced).

Model validation posture:

- Council model edits are validated at the server boundary against the OpenRouter model catalog cache.
- Invalid model ids are rejected (prevents persisting “broken” councils that would brick runs).
- Model display names are resolved server-side from the cache; the client does not authoritatively set `modelName`.

### Platform neutrality (no platform glue)

This repo must run on any standard Node.js host without platform-specific runtime plugins or artifacts.

- No platform runtime plugins.
- No platform data directories committed to git.
- No hosting-platform OAuth / Forge / SSO plumbing inside this codebase.

## Identity Contract

### `byok_id`

`byok_id` is the canonical identity value for all persisted user-owned resources.

- Definition: `byok_id = sha256_hex(openrouter_api_key)`
- Encoding: lowercase hex, 64 characters.
- Properties:
  - deterministic (same key → same id),
  - non-reversible in practice,
  - treated as sensitive metadata (keep it off logs; HTTPS only).

### `demo_email` + `demo_session_token`

Demo identity is email-scoped with time-bound session tokens.

- `demo_email` is stored lowercased and trimmed.
- Demo session tokens are **random**, stored **hashed** (sha256 hex), and expire after 24h.
- The plaintext demo token is only returned once at exchange time.

## Edge Contracts (HTTP JSON)

All HTTP JSON endpoints return a single success or error envelope.

Success:

```json
{ "trace_id": "uuid", "ts": "RFC3339", "result": { "resource": "string", "payload": {} } }
```

Error:

```json
{ "kind": "string", "message": "string", "trace_id": "uuid", "ts": "RFC3339", "details": {} }
```

Canonical error kinds:

- `invalid_input` (details: validation issues)
- `unauthorized` (details: missing/invalid auth)
- `forbidden` (details: policy violation)
- `not_found` (details: missing resource)
- `rate_limited` (details: scope + retry window)
- `upstream_error` (details: provider failure)
- `internal_error` (details: internal failure id)

Wire format:

- All timestamps in envelopes and payloads are RFC3339 strings (ISO 8601). No `Date` objects cross the HTTP boundary.
- Evidence: node_modules:zod/src/v3/types.ts:1108-1134

### Canonical API schemas

The canonical API schemas and error-detail discriminated union live in shared modules so client and server cannot drift:

- `shared/domain/apiSchemas.ts` — request/response payload schemas + envelopes.
- `shared/domain/apiErrors.ts` — error kinds and details schema.

### Authenticated edge contract (HTTP JSON)

All user-specific HTTP JSON edges require exactly one auth scheme via HTTP headers:

- BYOK header: `Authorization: Bearer <openrouter_api_key>`
- Demo header: `Authorization: Demo <demo_session_token>`
- Server behavior:
  - BYOK: derive `byok_id`, load-or-create the user row, execute using the provided key.
  - Demo: validate the demo token, load the demo user, execute using the server-owned demo key.

### Ingress tagging headers (HTTP JSON)

All HTTP JSON edges accept optional ingress metadata headers. Invalid values are ignored (the request still succeeds).

- `X-Seven-Ingress`: one of `web | cli | api` (defaults to `web` when missing or invalid).
- `X-Seven-Ingress-Version`: optional single-line string (trimmed; max 120 chars).

## Data Flow (Canonical)

### BYOK

1. User unlocks their OpenRouter API key locally (password → decrypt key).
2. Browser calls our server with `Authorization: Bearer <openrouter_api_key>`.
   - The browser does **not** call OpenRouter directly.
   - Optional first step: the UI calls `auth.validateKey` to confirm the key before persisting it locally.
3. The server derives `byok_id` and loads persisted councils/history.
4. When executing a query, the browser submits a job to our server with an explicit council selection.
5. Our server runs multi-model orchestration against OpenRouter and persists results under `byok_id`.
6. The browser polls for status and reads results by session id (authorized by the same key).

### Demo

1. User enters an email and requests a magic link.
2. Server validates abuse limits, issues a one-time link token, and sends email via Resend.
3. User opens the link; the client exchanges the token for a 24h demo session token.
4. Browser calls our server with `Authorization: Demo <demo_session_token>`.
5. The server authorizes the demo session, runs the Commons Council using the server-owned OpenRouter key, and stores results under the demo user.
6. The browser polls for status and reads results by session id (authorized by the demo token).

## Client Query State Handling

- Client data fetches must explicitly handle the query error state (`isError`) for all TanStack Query edges so failures never render silently.
  - Evidence: node_modules:.pnpm/@tanstack+query-core@5.90.12/node_modules/@tanstack/query-core/src/types.ts:653-669

## Security Notes

- The server must never persist or log:
  - plaintext OpenRouter keys,
  - ciphertext OpenRouter keys,
  - user password material.
- Demo session tokens are hashed before storage; only the plaintext token from the magic link exchange is returned to the client.
- Any “account recovery” is a client-only concept: losing the password means losing the locally stored encrypted key.

## Abuse Controls (Demo)

- Rate limits apply at the ingress layer for demo email requests, demo link consumption, and demo run submissions; prompts and attachments are not capped.
- Limits are enforced per email, per IP, and globally using fixed-window counters.
- Client IP is derived from `CF-Connecting-IP` when present (Cloudflare), with standard proxy fallbacks.
  - Evidence: `vendor:cloudflare:2025-12-21:https://developers.cloudflare.com/fundamentals/reference/http-headers/`

## Abuse Controls (BYOK)

- OpenRouter key validation (`auth.validate`) is rate-limited per BYOK id, per IP, and globally using fixed-window counters.
- Limit constants are defined in `server/domain/authLimits.ts` and enforced in `server/edges/http/authHandlers.ts`.

### Job durability (best effort + recoverable)

- Orchestration is best-effort: in-flight inference is not durable (no queue, no server-side key storage).
- Sessions are **recoverable**:
  - Each session persists a per-run snapshot (`runSpec`) at submit time (effective models, prompts, formatted user message).
  - The server can **continue** a failed session by executing only missing inference and leaving existing artifacts untouched.
- On server startup, any `pending` / `processing` sessions are reconciled to `failed` with `failureKind=server_restart`.

- Sessions can be **continued** from `runSpec` (idempotent) or **rerun** as a new session with an explicit council.
- Sessions record `failureKind` (stable vocabulary) when `status=failed`; no free-form failure messages are persisted.

## Prompt Packaging (Canonical)

This repo does not parse member outputs for control flow. Instead, it improves synthesis quality by making the **inputs** to Phase 2/3 deterministic and machine-friendly.

- **Phase 2 review input** (user message to reviewers `A..F`):
  - Includes the task and the other 5 Phase 1 answers (excluding the reviewer’s own answer).
  - Answers are provided in explicit XML tags: `<model_A>...</model_A>`, …, `<model_F>...</model_F>`.
- **Phase 2 review output**:
  - Instructed to return a single JSON payload (in a fenced code block).
  - Stored and displayed as raw text; not parsed for orchestration.
- **Phase 3 synthesis input** (user message to synthesizer `G`):
  - A versioned JSON payload that includes:
    - task context,
    - all Phase 1 answers (by slot `A–F`),
    - all Phase 2 reviews (raw text, by reviewer slot `A–F`).
  - The Phase 3 payload intentionally excludes council name and any model/provider identity to avoid bias and keep “voices” anonymous.

## Observability

- Every inbound HTTP request gets a `trace_id` that is returned as `X-Trace-Id`.
- Runtime logs are structured JSON and include `trace_id` where a request context exists.
- OpenRouter call diagnostics:
  - The server persists a per-call record for every OpenRouter chat completion request (Phase 1/2/3).
  - Each record includes:
    - phase + member slot (`A..G` via `memberPosition`),
    - request model id,
    - request size (system/user/total chars),
    - request timing (`requestStartedAt`, `responseCompletedAt`, `latencyMs` in epoch ms; `null` when no provider call occurred),
    - response metadata (id, routed model, finish reason, usage tokens),
    - billing metadata from generation stats (billed model id, total cost, native token counts),
    - error metadata when the call fails (HTTP status + message).
  - This enables a “Session Diagnostics” surface in the UI so we can answer: *what we sent*, *what OpenRouter replied*, and *whether truncation likely occurred*.
  - The OpenRouter API key is never persisted as part of diagnostics.

## Code Layout (Canonical)

This repo uses a strict role-based module taxonomy. Each runtime behavior follows a single path:

**ingress (edge)** → **boundary** → **service/workflow** → **adapter/store**

### Server taxonomy

- `server/_core/*`: process wiring + cross-cutting infrastructure.
  - Express server entrypoint, logging, runtime config, security headers.
- `server/edges/http/*`: HTTP JSON routers grouped by surface area (auth, demo, models, councils, sessions).
  - Edges validate/normalize inputs and call into workflows/services/stores.
  - Edges must not contain orchestration pipelines or provider HTTP logic.
- `server/workflows/*`: long-running orchestration jobs (multi-step, background work).
  - Workflows are responsible for status transitions and “job lifecycle” semantics.
- `server/services/*`: domain-level orchestration helpers that are request-agnostic and side-effect aware.
  - Services may call adapters/stores but must not know about Express or edge details.
- `server/domain/*`: typed domain models, validation helpers, limits, and pure transformations.
  - Domain modules must not touch I/O (no DB, no network, no filesystem).
- Canonical primitives live in `server/domain` when they are server-only:
  - `server/domain/outputPhase.ts` defines the `OutputPhase` union used by prompt builders.
  - `server/domain/providerModelRef.ts` owns the provider model reference schema shared across run-spec + council edges.
- `server/adapters/*`: external provider boundaries (HTTP, vendor SDKs).
  - Adapters never touch the DB and never read request headers directly (except as explicit inputs).
- `server/stores/*`: DB-only persistence modules.
  - Stores never perform HTTP calls and never accept secrets (OpenRouter keys) as inputs.
  - The canonical Drizzle client lives at `server/stores/dbClient.ts`.

### Shared taxonomy

- `shared/domain/*`: pure transformations shared by server and client (no framework imports, no I/O).
- Canonical cost/tokens totaling lives in `shared/domain/usage.ts` (USD stored/summed as integer micro-dollars, 1e-6).
  - Shared aggregation for OpenRouter usage totals also lives here so server + client stay consistent.
- Canonical council phase prompt shape lives in `shared/domain/phasePrompts.ts`.
- Built-in council slugs are defined once in `shared/domain/builtInCouncils.ts` for server + client decode.
- Shared string validation helpers (for example, single-line checks) live in `shared/domain/strings.ts`.
- Attachment file extension allowlist for client file inputs lives in `shared/domain/attachments.ts`.

### Client taxonomy

- `client/src/components/ui/*`: Radix/shadcn wrappers that bake in our primitives.
- `client/src/styles/*`:
  - `client/src/styles/tokens.css`: tokens + Tailwind v4 `@theme` mapping.
  - `client/src/styles/base.css`: base element styles (field background, typography).
  - `client/src/styles/components.css`: primitives (`.btn`, `.control`, `.card`, surfaces).
- `client/src/styles/utilities.css`: shared utility classes (`.text-*`, `.icon-*`, `.content-*`).
- `client/src/features/sessions/components/RunSheet.tsx`: canonical run detail surface shared by Ask, Journal, and `/session/:id`.
- `client/src/features/sessions/components/SessionResultsLadder.tsx`: phase ladder (Verdict -> Critiques -> Replies) with consistent row disclosure.
- `client/src/features/sessions/components/SessionDiagnosticsPanel.tsx`: stacked diagnostics sections with a single disclosure entrypoint.

### Frontend styling (canonical)

- Tokens and primitives are centralized under `client/src/styles/*` and `client/src/components/ui/*`; inline styles are not used in owned client code.
- Typography is tokenized: **MedievalSharp** for display + UI controls (navigation, labels, buttons), **Raleway** for body/prose, and **Victor Mono** for code/diagnostics.
- UI grammar is two-tier: Surfaces (primary sections) and Insets (nested sections). All copy affordances live in the surface action rail.

### UX Narrative (Canonical)

- **Ask** is the single chamber:
  - Composer first, with an embedded active Run Sheet underneath.
  - Key flows live in their dedicated cards.
  - Output formats are inspectable in Council editor + Session Diagnostics, not in the Ask entrypoint.
- **Journal** is the task hub:
  - Filters + selection actions live at the top.
  - Selecting a run reveals the Run Sheet inline (no extra navigation).
  - Export selected runs as JSON + Markdown with configurable item scopes; attachments are always included.
- **Run Sheet** is the canonical drill-down:
  - Phase ladder order: Verdict (Phase 3) -> Critiques (Phase 2) -> Replies (Phase 1).
  - Diagnostics is a single collapsed section with stacked sub-panels (no nested tabs).
  - Run actions (continue, rerun, export, dismiss/back) live in the Run Sheet header action rail.
- **Session deep link** (`/session/:id`) renders the same Run Sheet layout as Journal selection.
- All user and model text renders through the Markdown renderer for consistent typography and spacing.
- Council selection has no default on first use; after explicit selection it is persisted and preselected on subsequent asks.

### UI Entrypoint Manifest (Canonical)

- `/` -> Ask (single chamber with embedded Run Sheet when active)
- `/journal` -> Journal (filters, list, inline Run Sheet)
- `/council` -> Council (list + editor)
- `/session/:id` -> Run Sheet (deep link only; same layout as Journal selection)

### API Entrypoint Manifest (Canonical)

- `POST /api/auth/validate`
- `POST /api/demo/request`
- `POST /api/demo/consume`
- `GET /api/councils`
- `GET /api/councils/output-formats`
- `GET /api/councils/:ref`
- `POST /api/councils/duplicate`
- `PUT /api/councils/:id`
- `DELETE /api/councils/:id`
- `POST /api/models/validate`
- `POST /api/models/autocomplete`
- `POST /api/query/submit`
- `POST /api/query/continue`
- `POST /api/query/rerun`
- `GET /api/query/sessions`
- `GET /api/query/sessions/:id`
- `GET /api/query/sessions/:id/diagnostics`

### Batch CLI (Canonical)

`server/cli/batch.ts` provides unattended batch submission against the existing API surface.

- Invocation: `pnpm batch -- --file <path> [--concurrency N] [--wait] [--base-url URL]`
- Auth: reads `SEVEN_BYOK_KEY` from `.env` and sends `Authorization: Bearer <key>`.
- Targeting: `--base-url` (or `SEVEN_BASE_URL`) selects the server origin.
- Ingress: sends `X-Seven-Ingress: cli` (plus optional version header).
- Input format: JSONL (one object per line) with the schema:
  - `{ "question": "string", "councils": ["built_in:commons", "user:123"] }`

### Client state persistence (canonical)

The client persists only minimal UI state in `localStorage`:

- `seven.active_session_id`: last active run pinned on Ask + Journal.
- `seven.last_council_ref`: last explicitly selected council (preselect on future asks).
- `seven.query_draft`: draft question text for the Ask composer.
- `seven.demo_session_token`: demo auth token (24h TTL).
- `seven.demo_session_expires_at`: demo auth expiry timestamp (ms).
- `seven.demo_session_email`: demo email address (lowercased).

## Runtime Configuration (Canonical)

### Design

- The canonical configuration reader for Node processes in this repo is `server/_core/runtimeConfig.ts`.
- Only that module reads from `process.env` (directly). All other modules import typed config accessors.
- `.env` loading is explicit:
  - the server entrypoint imports `dotenv/config`,
  - the DB migration entrypoint (`server/_core/migrate.ts`) imports `dotenv/config` so local tooling behaves the same as the server.

### Environment Variables

- Optional (storage path):
  - `SEVEN_DB_PATH` (SQLite database file path; default `data/the-seven.db`)
- Optional (provider identity headers):
  - `SEVEN_PUBLIC_ORIGIN` (OpenRouter `HTTP-Referer`, default `http://localhost`)
  - `SEVEN_APP_NAME` (OpenRouter `X-Title`, default `The Seven`)
- Optional (demo mode):
  - `SEVEN_DEMO_ENABLED` (`0|1`, default `0`)
  - `SEVEN_DEMO_OPENROUTER_KEY` (server-owned OpenRouter key; required when demo enabled)
  - `SEVEN_DEMO_RESEND_API_KEY` (Resend API key; required when demo enabled)
  - `SEVEN_DEMO_EMAIL_FROM` (verified sender, e.g. `hello@updates.theseven.ai`)
- Optional (development only):
  - `SEVEN_DEV_DISABLE_OPENROUTER_KEY_VALIDATION` (`0|1`, default `0`)
- Optional (server wiring):
  - `PORT` (preferred port; server will pick a nearby free port if unavailable, default `3000`)
  - `NODE_ENV` (`development` | `production` | `test`, default `development`)

The canonical example lives in `.env.example`; keep it aligned with the list above.

## Attachments (Canonical)

- The server accepts attachments only via the `POST /api/query/submit` edge as base64-encoded file bytes.
- Attachments are ingested as a **pure** pipeline:
  1) validate (name + base64),
  2) decode base64 → bytes,
  3) detect type,
  4) convert to Markdown-friendly text,
  5) assemble the final user message (task + attachments block).
- Supported attachment types (no OCR, no transcription, no metadata fallback):
  - Plain text formats: `.txt`, `.md`/`.markdown`, `.json`, `.yaml`/`.yml`, `.csv`
  - Document formats (text extraction): `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.odt`, `.odp`, `.ods`
- Scanned/image-only PDFs are **not** supported (OCR is intentionally out of scope). If no extractable text is present, ingestion fails with a typed error.

### Prompt injection shape (attachments)

- Attachments are appended to the user message as Markdown:
  - a single `## Attachments` section,
  - one `### <filename>` subheading per attachment,
  - the extracted content inside a safely-fenced code block (fence length chosen to avoid collisions with backticks in the payload).
- We do not cap attachment count and we do not truncate/compress prompts. If a prompt is too large for a chosen model, OpenRouter rejects the request and we fail the phase with a recorded, inspectable error.

### Library evidence (attachments)

- We use `officeparser` for document text extraction (Office + PDF).
  - Evidence: `node_modules:officeparser/package.json:4`
- We use `file-type` for robust binary type detection.
  - Evidence: `node_modules:file-type/package.json:3`

## Database posture (SQLite‑only)

- The schema of record is `drizzle/schema.ts`.
- SQLite is the **only** storage engine (no memory or alternative drivers).
- The SQLite file path is resolved from `SEVEN_DB_PATH` (default `data/the-seven.db`).
- Migrations are squashed to a single baseline migration (`drizzle/0000_init.sql`).
- Schema changes are applied by editing `drizzle/schema.ts` and re-squashing the baseline.
- Sessions persist:
  - `runSpec` (a per-run snapshot for deterministic continuation),
  - `failureKind` when `status=failed` (stable vocabulary; no free-form messages).
  - `questionHash` (sha256 hex of the normalized runSpec user message),
  - `ingressSource` (`web | cli | api`) plus optional `ingressVersion` (single-line string).
- Question hash normalization:
  - normalize `runSpec.userMessage` by trimming and converting CRLF to LF,
  - hash is `sha256_hex(normalized_message)` (lowercase hex).
- Users persist `kind` (`byok|demo`) plus either `byokId` or `email`:
  - BYOK users store `byokId` (sha256 hex); `email` is `null`.
  - Demo users store `email` (lowercased); `byokId` is `null`.
- Demo authentication persists:
  - `demoAuthLinks` (one-time magic-link tokens, hashed, with expiry + use timestamps),
  - `demoSessions` (session tokens, hashed, 24h TTL),
  - `rateLimitBuckets` (fixed-window counters for demo email + run limits).
- The runtime uses a **single writer** SQLite connection with WAL mode, full synchronous writes, and foreign keys enabled.
  - Horizontal scaling is intentionally out of scope; one server instance owns the DB file.
  - Production deployments must mount a persistent volume for the DB file.
  - Backups are file-level snapshots copied to offsite storage (e.g., S3).
- We enforce referential integrity at the DB layer (no orphan rows):
  - `councils.userId → users.id` (cascade)
  - `councilMembers.councilId → councils.id` (cascade)
  - `sessions.userId → users.id` (cascade)
  - `memberResponses.sessionId → sessions.id` (cascade)
  - `memberReviews.sessionId → sessions.id` (cascade)
  - `memberSyntheses.sessionId → sessions.id` (cascade)
  - `pricingCache.modelId → modelsCache.modelId` (cascade)
- We enforce uniqueness at the DB layer (no duplicate artifacts per session/member):
  - `councilMembers (councilId, memberPosition)` unique
  - `memberResponses (sessionId, memberPosition)` unique
  - `memberReviews (sessionId, reviewerMemberPosition)` unique
  - `memberSyntheses (sessionId, memberPosition)` unique
- All DB access in server runtime code goes through `server/stores/*` modules (no ad-hoc Drizzle queries in routers/workflows/services).
- Gates enforce single baseline migration for schema stability.

### Library evidence (SQLite)

- Drizzle’s better-sqlite3 driver constructs a SQLite database from a string path or client and is the canonical sync driver used here.
  - Evidence: `node_modules:drizzle-orm/better-sqlite3/driver.js:1-56`
- Drizzle SQLite timestamp defaults use the `julianday('now')` millisecond expression we mirror for `createdAt`/`updatedAt`.
  - Evidence: `node_modules:drizzle-orm/sqlite-core/columns/integer.js:41-54`
- Drizzle SQLite insert supports `returning()` and conflict clauses used for idempotent inserts and upserts.
  - Evidence: `node_modules:drizzle-orm/sqlite-core/query-builders/insert.js:53-134`

## OpenRouter Integration (Canonical Boundary)

OpenRouter is integrated via a strict **adapter → store → service** split:

- The browser never talks to `openrouter.ai` directly; all provider traffic goes through the server adapter.
- Demo runs use a server-owned OpenRouter API key; BYOK runs use the user-provided key.
- **Adapter** (`server/adapters/openrouter/*`): HTTP-only code that talks to `openrouter.ai` and validates provider responses.
  - Inputs/outputs are fully typed at the boundary (runtime validation via `zod`).
  - The OpenRouter API key is accepted only as an in-memory parameter for chat completions.
  - Provider responses may include tool-calling shapes (`message.content` may be `null`), and the adapter validation tolerates these.
    - Orchestration in this repo requires a non-empty text payload for every Phase 1/2/3 call; `content=null` or blank content is treated as a hard failure and is recorded in per-call diagnostics.
  - Request shaping is capability-driven when available (`supported_parameters`); unsupported tuning parameters fail before calling OpenRouter.
  - The server enforces **no silent truncation** by explicitly disabling OpenRouter message transforms on every request (`transforms: []`).
    - Evidence: `vendor:openrouter:2025-12-19:https://openrouter.ai/docs/guides/features/message-transforms`
  - The server does not do local prompt token estimation. Oversized prompts fail only when OpenRouter rejects the request (and those failures are recorded and surfaced).
  - The server omits `max_tokens` for all calls and lets OpenRouter/provider defaults apply.
    - Rationale: without a model-aligned tokenizer we cannot safely cap output for oversized prompts; the provider must decide truncation.
  - Outbound identity headers are configured via environment:
    - `SEVEN_PUBLIC_ORIGIN` → OpenRouter `HTTP-Referer`
    - `SEVEN_APP_NAME` → OpenRouter `X-Title`
- **Store** (`server/stores/openrouterCacheStore.ts`): DB-only code for:
  - model catalog + capability metadata cache (`modelsCache`),
  - pricing cache (`pricingCache`).
  - Store code never performs HTTP calls and never knows about request headers.
- **Service** (`server/services/openrouterCatalog.ts`): orchestration logic that:
  - refreshes caches on a TTL policy (currently 24h),
  - exposes domain-friendly functions (`validateModelId`, `getModelDetails`, `getModelAutocomplete`).

## Resend Integration (Demo Email)

- Demo magic-link email uses Resend `POST /emails`.
- Required fields are `from`, `to`, and `subject`; HTML/text bodies are provided by the server.
  - Evidence: `vendor:resend:2025-12-21:https://resend.com/docs/api-reference/emails/send-email`
- Idempotency is enforced via `Idempotency-Key` for safe retries.
  - Evidence: `vendor:resend:2025-12-21:https://resend.com/docs/dashboard/emails/idempotency-keys`
- Sending domain is verified with SPF + DKIM; the sender uses the `updates.*` subdomain.
  - Evidence: `vendor:resend:2025-12-21:https://resend.com/docs/dashboard/domains/introduction`
- Resend rate limits (default 2 req/sec) are respected via edge throttling and per-email rate limits.
  - Evidence: `vendor:resend:2025-12-21:https://resend.com/docs/api-reference/rate-limit`

### Costs & Billing (Canonical)

- **Cost = out-of-pocket spend**, sourced from OpenRouter’s generation endpoint (not estimated from normalized usage).
- Chat completion `usage` tokens are **normalized**; they are retained for diagnostics only. Billing is based on **native token counts** exposed by the generation endpoint.
- For every OpenRouter call, we query `GET /api/v1/generation?id=<response_id>` and persist:
  - `billedModelId` (the actual routed model),
  - `totalCostUsdMicros` (USD micros, bigint),
  - `cacheDiscountUsdMicros` and `upstreamInferenceCostUsdMicros` when provided,
  - native token counts (`nativeTokensPrompt`, `nativeTokensCompletion`, `nativeTokensReasoning`),
  - media/search counts when present (`numMediaPrompt`, `numMediaCompletion`, `numSearchResults`).
- **No estimates**: if generation stats are missing, costs are `null` and session totals are marked **partial**.
- Session totals are derived solely from `openRouterCalls.totalCostUsdMicros` to avoid drift or double-counting.

### Model tuning (Curated)

We expose a small, high-signal subset of OpenRouter chat completion parameters as **per-member tuning**:

- `temperature` → OpenRouter `temperature` (number)
- `seed` → OpenRouter `seed` (integer)
- `verbosity` → OpenRouter `verbosity` (string; UI offers presets + custom)
- `reasoningEffort` → OpenRouter `reasoning: { effort: string }` (UI offers presets + custom)
- `includeReasoning` → OpenRouter `include_reasoning` (boolean; legacy-compatible)

Capability gating:

- Tuning controls are shown only when the OpenRouter model catalog advertises support in `supported_parameters`.
- Councils reject saving tuning values that are not advertised for the selected model (prevents persisting “broken” councils).
- In runtime preflight, unadvertised tuning parameters are rejected before calling OpenRouter when the model advertises capability metadata.

### Failure Semantics (Intentional)

- Catalog/pricing refresh is **best effort**:
  - If OpenRouter is unreachable, we keep operating on stale cache.
  - If the cache is empty, validation/autocomplete degrade safely:
    - `validateModelId` returns `false`,
    - `getModelAutocomplete` returns `[]`,
    - `calculateCost` returns `0`.
- Chat completions are **not** best effort:
  - If OpenRouter rejects the request, the orchestration job fails and the session is marked `failed`.
  - We retry **transient provider failures** with bounded backoff (no infinite retries). Transient signals include:
    - HTTP 408/429/5xx from OpenRouter requests.
    - `choice.error` codes 408/429/5xx returned inside a successful OpenRouter response (e.g. provider network loss).
  - Each attempt is recorded in `openRouterCalls` so diagnostics and billing totals include every billed attempt.

## Evidence

Evidence references (vendor + local runtime) live in `docs/ARCH_EVIDENCE.md`.
