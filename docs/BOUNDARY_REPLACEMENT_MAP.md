# Boundary Replacement Map

This document records the canonical owner for each surviving behavior in the rewrite.

## Runtime Boundaries

| Retired boundary | Canonical replacement |
| --- | --- |
| `client/**` SPA routes + hand-rolled history router | `apps/web/src/app/**` Next App Router routes |
| `server/_core/index.ts` Express bootstrap | `apps/web` Next runtime bootstrap |
| `server/edges/http/**` Express handlers | `apps/web/src/app/api/v1/**/route.ts` route handlers |
| `server/edges/trpc/**` | deleted; no replacement surface |
| `server/services/**` mixed orchestration/config services | `apps/web/src/server/**` by role: `auth`, `workflow`, `adapter`, `store` |
| `server/stores/**` ad hoc store modules | `packages/db` query and transaction modules |
| `shared/domain/**` free-floating shared types | `packages/contracts` canonical schema owner |
| runtime filesystem config reads from `config/prompts.json` | `packages/config` typed module exports |
| fire-and-forget session orchestration | durable `jobs` + worker supervisor |

## UI Boundaries

| Retired boundary | Canonical replacement |
| --- | --- |
| `/council` | `/councils` |
| `/journal` | `/sessions` |
| `/session/:id` | `/sessions/[sessionId]` |
| duplicated run-sheet render paths | one run inspector composed into the Ask (`/`) and Archive (`/sessions`) routes |
| unused shadcn wrappers | deleted; only rendered primitives survive |

## Contract Boundaries

| Retired boundary | Canonical replacement |
| --- | --- |
| unsuffixed `/api/*` | `/api/v1/*` |
| unversioned envelopes | `schema_version = 1` envelopes |
| split `councils` + `council_members` persistence | `councils.definition_json` aggregate row |
| `users.byok_id` / `users.email` identity split | `users(kind, principal)` |
| preview-then-record rate limiting | atomic admit-and-count limiter |
| miss-only catalog refresh | TTL-gated lazy refresh with single-flight dedupe |
| separate response/review/synthesis persistence tables | `session_artifacts` |
| non-durable orchestration status | `jobs` lease + `sessions` status |
| runtime-defined prompt file schema | `packages/config` prompt/output contract |

## Tooling Boundaries

| Retired boundary | Canonical replacement |
| --- | --- |
| Vite frontend build | Next build |
| esbuild server bundling | Next server build output |
| Prettier | Biome |
| ad hoc route/build aliases | workspace TS config + package exports |
| repo-root `.env` runtime scripts | repo-root `.env.local` loaded through the canonical config/env loader |
| manual local Postgres bootstrapping | `compose.yaml` Postgres service on `127.0.0.1:5432` |
| scattered local shell commands | `tools/local-dev.ts` subcommands surfaced as `pnpm local:*`; `pnpm dev` aliases `pnpm local:dev` |
| self-contained Playwright dev-server startup only | Playwright self-start through the local HTTP projection, or explicit external-server mode from `pnpm local:live` |
| dashboard-managed permanent Resend webhook for local testing | Resend Receiving API polling and retrieval owned by `pnpm test:live` |
