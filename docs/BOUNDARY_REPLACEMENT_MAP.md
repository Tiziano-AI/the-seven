# Boundary Replacement Map

This document records the canonical owner for each surviving behavior in the rewrite.

## Runtime Boundaries

| Retired boundary | Canonical replacement |
| --- | --- |
| `client/**` SPA routes + hand-rolled history router | `apps/web/app/**` Next App Router routes |
| `server/_core/index.ts` Express bootstrap | `apps/web` Next runtime bootstrap |
| `server/edges/http/**` Express handlers | `apps/web/app/api/v1/**/route.ts` route handlers |
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
| `/session/:id` | `/sessions/[id]` |
| duplicated run-sheet render paths | one run inspector composed into ask and sessions routes |
| unused shadcn wrappers | deleted; only rendered primitives survive |

## Contract Boundaries

| Retired boundary | Canonical replacement |
| --- | --- |
| unsuffixed `/api/*` | `/api/v1/*` |
| unversioned envelopes | `schema_version = 1` envelopes |
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
