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
railway link -p "The Seven"
railway service status --all
```

## Local Development

- `/Users/tiziano/.secrets/ALL.env` is the human-owned secret source; `.env.local` is the effective runtime symlink to the generated `the-seven.env` slice.
- `db:bootstrap:check` calls `serverRuntime()` — demo keys must be non-empty if `SEVEN_DEMO_ENABLED=1`.
- Database is greenfield. `DROP DATABASE` + `CREATE DATABASE` is a valid reset. No back-compat shims.
- Full restart cycle before live testing: kill server → reset DB → fresh test email → start server → run test.
- A full live test runs BYOK and demo council sessions plus demo email flow. The BYOK smoke prefers Commons, then Lantern, then Founding to prove the live path without defaulting to the most expensive council.

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

- OpenRouter models advertise different supported params. Built-in tuning defaults are model-specific, and unsupported non-null tuning is denied before provider execution.
- Built-in council tuning is the canonical default for all councils (built-in, duplicated, and user-created).
- Rate limiter `admitFixedWindowLimit` always increments the counter atomically. Scope evaluation order matters: narrowest first (per-IP → per-email → global) so noisy principals don't drain global quota.
- `startSessionProcessing` intentionally allows `processing → processing` transitions — this is the lease-reclaim path for crashed workers. The `WHERE lease_owner = ?` guard on completion/failure writes prevents data corruption.
- Upstream adapter `parseJson` functions must catch `SyntaxError` and throw the adapter's typed error class. CDN/proxy layers return HTML on 5xx.
- Only `packages/config/src/env.ts` reads `process.env` directly.
- Keep one canonical path per behavior. Delete conflicting old surfaces in the same change set.
- Styling is tokens-first via `@layer components` classes in `globals.css` (`.btn`, `.card`, `.control`, `.badge`, `.panel`, `.btn-nav`). UI primitives are thin wrappers that apply these classes. Avoid hard-coded colors, inline styles, and inline Tailwind for visual properties already covered by a CSS class.
- Three built-in councils: Founding (BYOK best-of-best; provider diversity is only a tie-breaker), Lantern (deliberate mid-tier bridge), Commons (paid low-cost demo). All 21 built-in model IDs are distinct across the tier clusters. Commons is not a free-model showcase and should not use `:free`, `~latest`, or preview aliases.
- Theme: OKLCH four-lane palette (violet/evergreen/wood/gold), dark-only. `globals.css` owns tokens + `@layer components` classes, `@theme` bridges to Tailwind v4 utilities, `color-scheme: dark` on `:root` styles all native elements. `next/font/google` loads MedievalSharp (display/UI), Raleway (body), Victor Mono (mono).
- Home screen is ask-first: auth is a centered gate card, ask surface + session result are full-width after auth. Phase display is chronological (1→2→3), never reversed.
- Destructive actions (Lock, End Demo, Delete Council) require `window.confirm()` gates.
- Council selectors use `<Select>` (native `<select>`) to show human-readable names. Model ID autocomplete in `model-slot-editor.tsx` uses `<Input list>` + `<datalist>` for free-text with suggestions. Do not use `<input list>` for fixed-option selectors — it shows raw `value` attributes instead of option labels.
- Sonner `<Toaster>` in `providers.tsx` must have `theme="dark"`. Without it, toasts render with light backgrounds.
- Files stay within the repository guardrails: max 500 lines and 18 kB.
