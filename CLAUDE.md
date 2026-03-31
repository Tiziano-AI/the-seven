# CLAUDE.md

Guidance for contributors working in this repository.

## Commands

```bash
pnpm run lint
pnpm run check
pnpm test
pnpm run build
pnpm run db:bootstrap:check
uv run --python 3.12 devtools/gate.py

pnpm local:doctor
pnpm local:bootstrap -- --install
pnpm local:db:up
pnpm local:db:down
pnpm local:db:reset
pnpm local:dev
pnpm local:gate
pnpm local:live
pnpm test:live
pnpm test:e2e
SEVEN_SKIP_DEMO_LIVE=1 pnpm test:live
pnpm batch -- --file <path>
```

## Local Development

- `.env.local` is the only canonical local secrets file. `loadServerEnv()` auto-loads it.
- `db:bootstrap:check` calls `loadServerEnv()` — demo keys must be non-empty if `SEVEN_DEMO_ENABLED=1`.
- Database is greenfield. `DROP DATABASE` + `CREATE DATABASE` is a valid reset. No back-compat shims.
- Full restart cycle before live testing: kill server → reset DB → fresh test email → start server → run test.
- A full live test runs two council sessions (21+ sequential LLM calls each) plus demo email flow. Budget 20-30 minutes.

## Architecture

- Workspace layout:
  - `apps/web` — Next App Router UI plus `/api/v1`
  - `apps/cli` — HTTP-only batch client
  - `packages/contracts` — canonical schemas and envelopes
  - `packages/config` — env schema, built-ins, prompts, limits
  - `packages/db` — Drizzle schema, init SQL, query layer
- BYOK contract: the browser encrypts the OpenRouter key locally and the server never stores plaintext BYOK keys.
- Demo contract: email magic link creates a 24-hour demo session that uses the Commons Council and server-owned provider credentials.
- Runtime contract:
  - UI routes: `/`, `/councils`, `/sessions`, `/sessions/[id]`
  - API routes: `/api/v1/**`
  - Startup bootstrap: `apps/web/src/instrumentation.ts` applies the squashed init SQL, then starts the durable worker supervisor
- Persistence: PostgreSQL only. The canonical schema owner is `packages/db/drizzle/0000_init.sql` and `packages/db/src/schema.ts`.

## Key Files

- `ARCH.md` — canonical architecture and citations
- `packages/config/src/builtInCouncils.ts` — built-in council model lineups and tuning defaults
- `apps/web/src/server/workflow/orchestrateSession.ts` — three-phase council execution
- `apps/web/src/server/workflow/jobSupervisor.ts` — durable job leasing and recovery
- `apps/web/src/server/adapters/openrouter.ts` — provider adapter with tuning param filtering
- `apps/web/src/components/sessions/session-inspector.tsx` — canonical run detail UI
- `apps/cli/src/batch.ts` — batch client surface
- `tools/local-dev.ts` — local operator CLI (doctor, bootstrap, db, dev, gate, live)
- `tools/live-test.ts` — provider-backed smoke (BYOK + demo email + Playwright)
- `compose.yaml` — local Postgres on 127.0.0.1:5432

## Conventions

- OpenRouter models advertise different supported params. Tuning defaults (temp, topP, reasoning) are set globally; the adapter silently drops params the model doesn't support at call time.
- Built-in council tuning is the canonical default for all councils (built-in, duplicated, and user-created).
- Rate limiter `admitFixedWindowLimit` always increments the counter atomically. Scope evaluation order matters: narrowest first (per-IP → per-email → global) so noisy principals don't drain global quota.
- `startSessionProcessing` intentionally allows `processing → processing` transitions — this is the lease-reclaim path for crashed workers. The `WHERE lease_owner = ?` guard on completion/failure writes prevents data corruption.
- Upstream adapter `parseJson` functions must catch `SyntaxError` and throw the adapter's typed error class. CDN/proxy layers return HTML on 5xx.
- Only `packages/config/src/env.ts` reads `process.env` directly.
- Keep one canonical path per behavior. Delete retired surfaces in the same change set.
- Styling is tokens-first; avoid hard-coded colors and inline styles.
- Files stay within the repository guardrails: max 500 lines and 18 kB.
