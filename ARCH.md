# Architecture

The Seven is a privacy-first, BYOK multi-model orchestration product with one canonical implementation path:

- one `pnpm` workspace,
- one Next App Router web app,
- one public HTTP JSON contract under `/api/v1`,
- one durable Postgres-backed orchestration engine,
- one shared contract/config/database model.

This document is the canonical technical contract for the rewrite.

## Product Invariants

- BYOK remains browser-owned. Plaintext OpenRouter keys never persist server-side; background jobs use envelope-encrypted short-lived credential blobs.
- Demo remains zero-friction. Email magic links issue a 24-hour demo session and are limited to the Commons Council.
- Councils remain 7 fixed member slots `A–G`, with shared phase prompts and optional per-member tuning.
- Runs remain immutable historical records. Continue resumes missing work inside the same failed session. Rerun creates a new session.
- Provider traffic remains server-side. Browsers never call OpenRouter directly.
- Live updates remain polling-based in v1. No parallel realtime transport is introduced.

## Canonical Repository Shape

- `apps/web`
  - Next App Router application
  - route handlers under `app/api/v1/**/route.ts`
  - server-only orchestration, auth, and adapter modules under `src/server/**`
  - client components and design-system code under `src/components/**`
- `apps/cli`
  - HTTP-only batch client against `/api/v1`
- `packages/contracts`
  - shared Zod schemas, envelope builders, request/response contracts, and domain enums
- `packages/config`
  - environment schema, prompt defaults, output formats, built-in councils, limits, and runtime constants
- `packages/db`
  - Drizzle schema, queries, transactions, and test database helpers

No runtime code remains in `client/`, `server/`, or `shared/`.

## Canonical Runtime Stack

- Web/runtime: Next App Router on Node runtime
- UI: React 19, Tailwind v4, shadcn/ui, Radix only where actually rendered
- Client state: native `fetch` + local React state; browser-owned auth and drafts stay client-side
- Validation: Zod from `packages/contracts`
- Database: PostgreSQL via `pg` and Drizzle
- Formatting/linting/import organization: Biome only
- External providers: one adapter per provider boundary

### Decision Basis

- Next App Router is the canonical router/build/runtime for server and client composition, route handlers, and server/client component boundaries.
  - Source: [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
  - Source: [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- Worker startup hooks are owned through Next instrumentation on the Node runtime.
  - Source: [Next.js instrumentation](https://nextjs.org/docs/app/guides/instrumentation)
- shadcn/ui is supported on Next.js 15 + React 19 and Tailwind v4.
  - Source: [shadcn/ui for Next.js](https://ui.shadcn.com/docs/installation/next)
  - Source: [shadcn/ui React 19 + Tailwind v4](https://ui.shadcn.com/docs/react-19)
- Biome is the sole formatter/linter/config surface and supports monorepo root configuration.
  - Source: [Biome configuration](https://biomejs.dev/reference/configuration/)
- Drizzle + `pg` remains the canonical Postgres access path.
  - Source: [Drizzle connection overview](https://orm.drizzle.team/docs/connect-overview)
  - Source: [Drizzle PostgreSQL project structure](https://orm.drizzle.team/docs/get-started/postgresql-existing)
  - Source: [node-postgres pooling](https://node-postgres.com/features/pooling)
  - Source: [node-postgres pool sizing](https://node-postgres.com/guides/pool-sizing)

## Route Contract

### UI Routes

- `/`
  - public onboarding plus authenticated ask surface
- `/councils`
  - council library and council editor
- `/sessions`
  - journal and selection-based inspector
- `/sessions/[sessionId]`
  - deep-link run inspector

### API Routes

All machine-facing routes live under `/api/v1`.

- `POST /api/v1/auth/validate`
- `POST /api/v1/demo/request`
- `POST /api/v1/demo/consume`
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
- `GET /api/v1/sessions/[id]`
- `POST /api/v1/sessions/[id]/continue`
- `POST /api/v1/sessions/[id]/rerun`
- `GET /api/v1/sessions/[id]/diagnostics`
- `POST /api/v1/sessions/export`

No second API surface exists. No tRPC surface exists. No framework-internal mutation path replaces these public contracts.

## HTTP Envelope Contract

Every HTTP JSON edge emits one success or one error envelope.

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

`packages/contracts` owns these shapes. Route handlers project from that owner and do not hand-maintain divergent payloads.

## Auth Contract

### BYOK

- Browser stores the encrypted OpenRouter key locally behind a user password.
- Browser sends `Authorization: Bearer <openrouter_api_key>` to `/api/v1`.
- Server derives `byok_id = sha256_hex(openrouter_api_key)` and uses the key transiently for upstream requests.
- When a job must outlive the request, server persists only an envelope-encrypted credential blob tied to that job and deletes it when the job reaches a terminal state.
- Server never persists plaintext keys or user passwords.

### Demo

- Browser requests a magic link with an email address.
- Server stores a hashed one-time token, sends the email via Resend, and exchanges the token for a 24-hour demo session.
- Browser sends `Authorization: Demo <demo_session_token>` to `/api/v1`.
- Demo sessions can only run the Commons Council.

### Ingress Headers

- `X-Seven-Ingress`: `web | cli | api`
- `X-Seven-Ingress-Version`: optional single-line version label

## Persistence Contract

The database is greenfield and may be dropped and recreated. One squashed init migration is the only migration artifact.

### Core tables

- `users`
  - user identity, either BYOK or demo
- `demo_magic_links`
  - one-time demo email tokens
- `demo_sessions`
  - 24-hour demo session tokens
- `councils`
  - saved council metadata and phase prompts
- `council_members`
  - exactly seven member slots per user council
- `sessions`
  - immutable run snapshot, attachment snapshot, visible status, failure kind, totals, trace metadata
- `session_artifacts`
  - canonical phase outputs keyed by session, artifact kind, and member position
- `provider_calls`
  - upstream request/response diagnostics, latency, finish, and pricing
- `jobs`
  - durable execution queue, lease control, and envelope-encrypted worker credentials
- `rate_limit_buckets`
  - fixed-window counters
- `catalog_cache`
  - OpenRouter model catalog and validation cache

### Session snapshot model

`sessions` owns the immutable snapshot of:

- user query,
- decoded attachment set,
- council name at run,
- council member model selection,
- council phase prompts,
- output formats,
- ingress metadata.

Historical inspection never dereferences live council state.

## Durable Orchestration Contract

- Submit, continue, and rerun create or requeue a job in the same transaction as session state changes.
- Submit, continue, and rerun persist the worker credential as an envelope-encrypted job field in the same transaction as session state changes.
- Node runtime boot applies the single init SQL and then starts one in-process supervisor through Next instrumentation.
- The supervisor claims jobs with a lease, renews while active, and releases or terminally commits on success/failure.
- Phase execution remains:
  - phase 1: six reviewer replies in parallel,
  - phase 2: six reviewer critiques in parallel,
  - phase 3: one synthesizer verdict.
- Partial artifacts are idempotent checkpoints. Resume skips already-persisted work and executes only missing artifacts.
- Provider rate limits remain a typed surfaced failure, not a local silent retry loop.
- Automatic retries are bounded and adapter-owned. There is no unbounded replay.

## Client Architecture Contract

- Server Components own page shells, route-level framing, and public/server-safe data.
- Client Components own:
  - WebCrypto,
  - local auth storage,
  - query drafting,
  - file input,
  - council editing interactions,
  - polling and mutation UX.
- One canonical run inspector component renders active and historical sessions from the same session-detail contract.

## External Adapter Contract

- OpenRouter adapter
  - key validation
  - model catalog fetch
  - chat completions
  - generation lookup
  - typed upstream failure mapping
- Resend adapter
  - demo magic-link email send
  - idempotency key propagation
  - typed upstream failure mapping

Adapters use native `fetch`. Axios is retired.

## Verification Contract

The default delivery gate must prove:

- Biome passes,
- TypeScript passes,
- Vitest passes,
- Playwright passes,
- Next build passes,
- blank-database bootstrap passes,
- the database still uses one squashed init migration,
- no retired runtime paths or dependencies remain referenced.
