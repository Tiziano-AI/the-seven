# Architecture

The Seven is a privacy-first BYOK multi-model council product with one canonical
implementation path:

- one `pnpm` workspace,
- one Next App Router web app on the Node runtime,
- one public HTTP JSON contract under `/api/v1`,
- one durable Postgres-backed orchestration engine,
- one shared contracts/config/database model,
- one local operator surface under `pnpm local:*`.

This document is the canonical technical contract for the launch-candidate
rewrite. The change set is greenfield: superseded HTTP shapes, demo-token
storage, stale model aliases, operator profiles, and validation claims are
deleted instead of shimmed.

## Product Invariants

- BYOK remains browser-owned. Plaintext OpenRouter keys never persist
  server-side; background jobs use envelope-encrypted short-lived credential
  blobs.
- Demo remains zero-friction. Email magic links are consumed by a server GET
  endpoint that issues a 24-hour `HttpOnly` cookie and limits the session to the
  Commons Council.
- Councils remain 7 fixed member slots `A-G`, with shared phase prompts and
  optional per-member tuning.
- Runs remain immutable historical records. Continue resumes missing work inside
  the same failed session. Rerun creates a new session.
- Provider traffic remains server-side. Browsers never call OpenRouter directly.
- Live updates remain polling-based in v1. No parallel realtime transport is
  introduced.

## Canonical Repository Shape

- `apps/web`
  - Next App Router application
  - route handlers under `src/app/api/v1/**/route.ts`
  - server-only orchestration, auth, adapter, and HTTP modules under
    `src/server/**`
  - client components and design-system code under `src/components/**`
- `apps/cli`
  - HTTP-only batch client against `/api/v1`
- `packages/contracts`
  - shared Zod schemas, `/api/v1` route registry, envelope builders, typed
    error-detail constructors, request/response contracts, and domain enums
- `packages/config`
  - environment profiles, prompt defaults, output formats, built-in councils,
    limits, and runtime constants
- `packages/db`
  - Drizzle schema, hand-owned squashed init SQL, queries, transactions, and
    test database helpers

No runtime code remains in `client/`, `server/`, or `shared/`.

## Runtime Stack

- Web/runtime: Next App Router on Node runtime
- UI: React 19, Tailwind v4, shadcn/ui, Radix only where actually rendered
- Client state: native `fetch` plus local React state; browser-owned BYOK auth
  and drafts stay client-side. Demo identity is cookie-owned server state.
- Validation: Zod from `packages/contracts`
- Database: PostgreSQL via `pg` and Drizzle
- Formatting/linting/import organization: Biome only
- External providers: one adapter per provider boundary

### Runtime Decision Basis

- Next App Router is the canonical router/build/runtime for server and client
  composition, route handlers, and server/client component boundaries.
  - Source: `vendor:next:16.2.1:https://nextjs.org/docs/app/getting-started/server-and-client-components`
  - Source: `vendor:next:16.2.1:https://nextjs.org/docs/app/getting-started/route-handlers`
- Worker startup hooks are owned through Next instrumentation on the Node
  runtime.
  - Source: `vendor:next:16.2.1:https://nextjs.org/docs/app/guides/instrumentation`
- Node exposes built-in dotenv loading through `process.loadEnvFile`, which
  keeps local env loading dependency-free.
  - Source: `vendor:node:26:https://nodejs.org/api/process.html#processloadenvfilepath`
- Docker Compose service health checks and named-volume lifecycle support one
  canonical local Postgres substrate and deterministic reset flow.
  - Source: `vendor:docker:compose:https://docs.docker.com/reference/compose-file/services/#healthcheck`
  - Source: `vendor:docker:compose:https://docs.docker.com/reference/cli/docker/compose/down/`
- Playwright supports a `webServer` config that can either start a server or
  reuse an existing one, which lets `pnpm local:live` own app startup.
  - Source: `vendor:playwright:1.59.1:https://playwright.dev/docs/test-webserver`
- Resend documents that inbound email webhooks carry metadata and require the
  Received Emails API for body retrieval. It also documents list and retrieve
  endpoints for received emails and states that inbound emails are stored even
  when no webhook is configured or a webhook endpoint is unavailable. `pnpm
  local:live` therefore polls the Receiving API for the just-requested demo
  email and retrieves the body from the provider-owned mailbox instead of
  creating a temporary local webhook tunnel.
  - Source: `vendor:resend:2026-05-10:https://resend.com/docs/api-reference/emails/list-received-emails`
  - Source: `vendor:resend:2026-05-10:https://resend.com/docs/api-reference/emails/retrieve-received-email`
  - Source: `vendor:resend:2026-05-09:https://resend.com/docs/webhooks/emails/received`
  - Source: `vendor:resend:2026-05-10:https://resend.com/blog/inbound-emails`

## HTTP Contract Registry

All machine-facing routes live under `/api/v1`.

`packages/contracts/src/http/registry.ts` owns every route row. Each row declares:

- method,
- path pattern,
- resource name,
- auth policy,
- path params schema,
- query schema,
- request body schema,
- success payload schema,
- response mode (`json` or `redirect`),
- denial rows.

Web route files adapt registry rows to `NextResponse`; they do not define public
resource names, envelope shapes, or body contracts. Success and error envelopes
are built by `packages/contracts` and emitted by the web adapter.

Route input parsing is single-pass. The web adapter parses path params, query,
and body once through the registry schemas, then passes the transformed outputs
to handlers. Handlers never re-parse transformed path params such as council
`locator`.

### API Routes

- `POST /api/v1/auth/validate`
- `POST /api/v1/demo/request`
- `GET /api/v1/demo/consume`
- `GET /api/v1/demo/session`
- `POST /api/v1/demo/logout`
- `GET /api/v1/councils`
- `GET /api/v1/councils/[locator]`
- `POST /api/v1/councils/duplicate`
- `PUT /api/v1/councils/[locator]`
- `DELETE /api/v1/councils/[locator]`
- `GET /api/v1/councils/output-formats`
- `POST /api/v1/models/validate`
- `POST /api/v1/models/autocomplete`
- `POST /api/v1/sessions`
- `GET /api/v1/sessions`
- `GET /api/v1/sessions/[sessionId]`
- `POST /api/v1/sessions/[sessionId]/continue`
- `POST /api/v1/sessions/[sessionId]/rerun`
- `GET /api/v1/sessions/[sessionId]/diagnostics`
- `POST /api/v1/sessions/export`

No second API surface exists. No tRPC surface exists. No framework-internal
mutation path replaces these public contracts.

### HTTP Envelope Contract

Every JSON edge emits one success or one error envelope.

Success:

```json
{
  "schema_version": 1,
  "trace_id": "uuid",
  "ts": "RFC3339",
  "result": {
    "resource": "string",
    "payload": {}
  }
}
```

Error:

```json
{
  "schema_version": 1,
  "kind": "string",
  "message": "string",
  "details": {},
  "trace_id": "uuid",
  "ts": "RFC3339"
}
```

Canonical error kinds:

- `invalid_input`
- `unauthorized`
- `forbidden`
- `not_found`
- `rate_limited`
- `upstream_error`
- `internal_error`

Reserved envelope fields are `schema_version`, `trace_id`, `ts`, `result`,
`resource`, `payload`, `kind`, `message`, and `details`.

## Auth, Authority, and Ingress

- BYOK principal = `sha256_hex(openrouter_api_key)`, but the principal is not
  materialized until OpenRouter validates the key.
- Demo principal = normalized email address.
- Browser BYOK requests send `Authorization: Bearer <openrouter_api_key>` to
  `/api/v1`.
- Browser demo requests send no demo authorization header. The server reads one
  `HttpOnly; SameSite=Lax; Secure-in-production` cookie created by
  `GET /api/v1/demo/consume`.
- Cookie-auth mutating routes enforce same-origin request checks before handler
  execution. BYOK routes remain header-based and do not use cookie authority.
- Demo mode may read sessions and submit runs, but only with the Commons
  Council.
- Demo mode cannot duplicate, update, or delete councils.

Request admission is split into two process edges:

1. Metadata admission creates a server-owned trace ID, parses
   `X-Seven-Ingress`, bounds client metadata, and resolves IP only from direct
   request state or explicitly trusted proxy rules.
2. Auth admission validates BYOK keys upstream before user creation and
   validates demo cookies against the demo-session table.

Ingress flood rate limiting runs between metadata admission and auth admission,
before demo-session lookup, BYOK user creation, or any other authenticated DB
mutation. Invalid `X-Seven-Ingress`, multiline ingress version, and oversized
ingress version deny as `invalid_input`; they never fall back to `web`.

Server trace IDs are canonical audit truth. Client trace/request IDs are
optional bounded metadata only.

## Demo Auth

`POST /api/v1/demo/request` accepts an email address, applies rate limits before
user or magic-link creation, creates a one-time magic-link token, and sends an
email through Resend.

The email link targets:

```text
/api/v1/demo/consume?token=<one-time-token>
```

`GET /api/v1/demo/consume` validates the token, marks it used, creates a demo
session, sets the demo cookie, and redirects to `/`. Missing, reused, expired,
or invalid tokens return the typed denial envelope. Browser localStorage never
stores a demo token.

`GET /api/v1/demo/session` returns the active cookie session metadata for UI
bootstrap. `POST /api/v1/demo/logout` clears the cookie.

## Provider Capability

OpenRouter is the only provider boundary. Its public model catalog exposes model
identifiers, context length, pricing, and `supported_parameters`; every provider
call snapshots the catalog row before execution and denies unsupported non-null
tuning before contacting the provider.
OpenRouter HTTP calls are bounded by a request timeout and transport failures
map to typed upstream diagnostics instead of hanging a job indefinitely.

- Source: `vendor:openrouter:2026-05-10:https://openrouter.ai/docs/guides/overview/models`
- Source: `vendor:openrouter:2026-05-10:https://openrouter.ai/docs/api-reference/chat-completion`
- Source: `vendor:openrouter:2026-05-10:https://openrouter.ai/docs/guides/best-practices/reasoning-tokens`
- Source: `vendor:openrouter:2026-05-10:https://openrouter.ai/api/v1/models`

Fresh catalog probe on 2026-05-10 returned status 200 and 367 models. A
bounded BYOK chat-completion probe on 2026-05-10 completed for the selected
Founding, Lantern, and Commons model IDs through OpenRouter. Artificial Analysis
on 2026-05-10 ranks GPT-5.5 with xhigh reasoning as the leading intelligence
row, followed by Claude Opus 4.7, Gemini 3.1 Pro Preview, and the current Kimi,
MiMo, Grok, Qwen, Sonnet, and DeepSeek frontier cluster. The built-in roster
policy is positive and tier-owned:

- Founding is the BYOK flagship. It uses the best current OpenRouter-accessible
  model IDs available for broad reasoning. Price is not a selection constraint.
  The seven slots are distinct; provider diversity is a tie-breaker only and
  never justifies omitting a stronger current model.
- Lantern is the deliberate mid-tier bridge. It uses strong current models that
  sit below the flagship set while preserving distinct model IDs and useful
  provider breadth. It sends medium reasoning effort by default.
- Commons is the demo council. It is paid, cheap, reliable, and good enough to
  sell the product; it is not a free-model showcase and it does not use `:free`,
  `~latest`, or preview model aliases. Commons sends low reasoning effort by
  default because the product already runs multi-phase deliberation; xhigh
  per-member demo calls multiply latency and cost without being the demo
  contract.

Current built-in rosters:

| Tier | Member 1 | Member 2 | Member 3 | Member 4 | Member 5 | Member 6 | Synthesizer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Founding | `openai/gpt-5.5` | `anthropic/claude-opus-4.7` | `google/gemini-3.1-pro-preview` | `moonshotai/kimi-k2.6` | `xiaomi/mimo-v2.5-pro` | `x-ai/grok-4.3` | `openai/gpt-5.5-pro` |
| Lantern | `qwen/qwen3.6-max-preview` | `deepseek/deepseek-v4-pro` | `x-ai/grok-4.20` | `qwen/qwen3.6-plus` | `z-ai/glm-5.1` | `mistralai/mistral-medium-3-5` | `anthropic/claude-sonnet-4.6` |
| Commons | `google/gemini-3.1-flash-lite` | `deepseek/deepseek-v4-flash` | `qwen/qwen3.6-35b-a3b` | `minimax/minimax-m2.7` | `mistralai/mistral-small-2603` | `arcee-ai/trinity-large-thinking` | `openai/gpt-5.4-nano` |

The 2026-05-10 catalog rows for these IDs expose text input/output, nonzero
prompt and completion pricing, no expiration date, context windows from 196k to
1.05M tokens, and model-specific `supported_parameters`. The 21 built-in model
IDs are distinct across the three tier clusters. Bounded BYOK
chat-completion probes on 2026-05-10 completed for every selected ID through
the OpenRouter `/api/v1/chat/completions` endpoint. Commons latency probes use
the app-compatible low-reasoning tuning shape, Lantern uses medium reasoning,
and Founding keeps xhigh reasoning for the flagship council.
OpenRouter's programming collection ranks current Kimi, Opus, DeepSeek, Sonnet,
MiniMax, and Grok rows among its current programming leaders. Artificial
Analysis reports fresh May 2026 evaluations where GPT-5.5 with xhigh reasoning
leads the intelligence table, Claude Opus 4.7 and Gemini 3.1 Pro Preview are
the next flagship rows, and Kimi K2.6, MiMo-V2.5-Pro, and Grok 4.3 remain in
the leading broad-model cluster. Qwen Max, DeepSeek V4 Pro, GLM 5.1, Qwen Plus,
Mistral Medium 3.5, and Sonnet 4.6 form the stronger distinct mid-tier cluster
instead of duplicating Founding defaults.

- Source: `vendor:openrouter:2026-05-10:https://openrouter.ai/collections/programming`
- Source: `vendor:artificialanalysis:2026-05-10:https://artificialanalysis.ai/leaderboards/models`

Retired built-in IDs are not aliases. `openai/gpt-5.4`,
`openai/gpt-5.4-mini`, `anthropic/claude-opus-4.6`, `z-ai/glm-5`,
`moonshotai/kimi-k2.5`, `qwen/qwen3.5-397b-a17b`,
`qwen/qwen3.5-122b-a10b`, `deepseek/deepseek-v3.2-speciale`,
`mistralai/mistral-medium-3.1`, `amazon/nova-pro-v1`,
`anthropic/claude-haiku-4.5`, `google/gemini-3.1-flash-lite-preview`,
`kwaipilot/kat-coder-pro-v2`, `bytedance-seed/seed-2.0-lite`,
`amazon/nova-premier-v1`, `amazon/nova-lite-v1`,
`meta-llama/llama-4-scout`, `x-ai/grok-4.1-fast`,
`google/gemini-3-flash-preview`, `qwen/qwen3.6-flash`,
`xiaomi/mimo-v2.5`, `stepfun/step-3.5-flash`,
`nvidia/nemotron-3-super-120b-a12b`, and `z-ai/glm-4.7-flash` are removed from
built-ins because current catalog, live proof, and quality signals expose
stronger successors, cleaner tier fits, preview risk, expiration risk, empty
content, provider reliability risk, or insufficient launch-confidence for a
canonical default.

API-key admission uses OpenRouter `/key` validation before a BYOK user row is
created. Invalid keys deny as `unauthorized`; provider transport failures deny
as `upstream_error`.

- Source: `vendor:openrouter:2026-05-10:https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key`

Provider diagnostics persist requested model, catalog freshness, supported
params, sent params, denied params, upstream status/code, response model,
generation ID, and billing lookup status. Generation billing
lookup is diagnostic only. A missing or failed lookup marks the provider-call
diagnostic row as pending or failed; it does not rewrite the execution result.

- Source: `vendor:openrouter:2026-05-09:https://openrouter.ai/docs/api-reference/overview`

Built-in council tuning is explicit per model. Unsupported defaults are `null`;
OpenAI and Anthropic Opus defaults omit `temperature` and `top_p` when the
catalog does not advertise them. Unsupported non-null user tuning is denied
before provider execution with typed diagnostics.

## Orchestration and Persistence

- Submit creates one immutable `sessions` row plus one queued `jobs` row in a
  transaction.
- `jobs` rows are claimed with `FOR UPDATE SKIP LOCKED`.
- Leases expire and are reclaimable.
- Continue is allowed only for failed sessions and requeues the same session.
- Rerun is allowed only for terminal sessions and creates a new session.
- Completed sessions are idempotent.
- Provider artifacts are inserted idempotently by `(session_id, artifact_kind,
  member_position)`.
- Short-lived worker credentials are envelope-encrypted with HKDF-derived
  AES-GCM keys. The envelope carries version and key ID, and the AAD binds the
  credential to user/session/job identity.

The database is pre-release greenfield. Schema changes update
`packages/db/src/schema.ts` and `packages/db/drizzle/0000_init.sql` together;
there are no migration compatibility layers.

## Payload Bounds and Redaction

- JSON request parsing requires `application/json` and reads the body through a
  byte-accurate bounded stream before parsing.
- Attachments have one policy: maximum count, filename length, decoded-byte
  length, extracted-char length, MIME/extension allowlist, parser timeout, and
  deterministic denial reasons.
- One redaction mapper runs before HTTP errors, provider-call diagnostics, logs,
  and UI diagnostic payloads. Secrets and bearer-like tokens are never emitted.

## Configuration Profiles

`packages/config` owns all environment requiredness:

- `serverRuntime`: Next server/runtime requirements.
- `cliRuntime`: CLI batch requirements.
- `operatorDoctor`: local workstation and minimal runnable development
  requirements.
- `liveProof`: live OpenRouter, Resend, demo sender, and demo test-inbox
  requirements.
- `playwrightProjection`: browser test projection from live/demo proof.

`pnpm local:doctor` proves local development readiness and does not require live
provider keys. `pnpm local:doctor --live` proves live-proof key presence and
secret hygiene. `pnpm local:live` runs the live doctor profile before live work.

Human-owned secrets live in `/Users/tiziano/.secrets/ALL.env` under
`THE_SEVEN__...` keys. `tiz-home secrets sync` generates
`/Users/tiziano/.secrets/the-seven.env`, and The Seven loads that slice through
the repo-local `.env.local` symlink. `tiz-home --json secrets doctor` proves
that the master pool, app slice, and projection are structurally healthy without
exposing secret values.

`.env.local.example` is minimal runnable development with demo disabled.
`.env.live.example` documents the live-proof overlay for BYOK, Resend, demo
sender, and demo test inbox.

Doctor fails when:

- `.env.local` is missing required development keys,
- the secret-slice target is broader than `0600`,
- `.env` contains runtime keys,
- credential-looking values are obvious placeholders,
- Playwright Chromium is missing,
- `DATABASE_URL` targets `127.0.0.1:5432` and that port is not free for, or
  owned by, `the-seven-postgres`.

## Validation Bar

The final closeout sequence is:

```bash
pnpm local:doctor
pnpm local:db:up
pnpm run db:bootstrap:check
uv run --python 3.12 devtools/gate.py --full
```

When live keys are present, closeout additionally requires:

```bash
pnpm local:doctor --live
pnpm local:live
```

`pnpm local:live` keeps repeatable local proof by deleting only the
proof-owned demo rate-limit buckets for `SEVEN_DEMO_TEST_EMAIL`, loopback IP
scopes, and the demo proof's global demo scopes before it requests a fresh
magic link. Product rate limits remain enforced in the route and covered by the
deterministic auth/security tests; the live harness cleanup does not change
runtime admission behavior.

When live keys are absent, `HANDOFF.md` records `[blocked]` with the exact
missing keys. When a live provider key is present but quota-limited,
`HANDOFF.md` records the provider quota blocker. Mocked provider success never
counts as launch proof.
