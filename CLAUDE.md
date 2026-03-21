# CLAUDE.md

Guidance for contributors working in this repository.

## Commands

```bash
pnpm dev
pnpm run lint
pnpm run check
pnpm test
pnpm run build
pnpm run db:bootstrap:check
pnpm batch -- --file <path>

uv run --python 3.12 devtools/gate.py
```

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
- `apps/web/src/server/workflow/orchestrateSession.ts` — three-phase council execution
- `apps/web/src/server/workflow/jobSupervisor.ts` — durable job leasing and recovery
- `apps/web/src/components/sessions/session-inspector.tsx` — canonical run detail UI
- `apps/cli/src/batch.ts` — batch client surface

## Conventions

- Only `packages/config/src/env.ts` reads `process.env` directly.
- Keep one canonical path per behavior. Delete retired surfaces in the same change set.
- Styling is tokens-first; avoid hard-coded colors and inline styles.
- Files stay within the repository guardrails: max 500 lines and 18 kB.
