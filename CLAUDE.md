# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commands

```bash
pnpm dev                    # Dev server (hot reload)
pnpm test                   # Run tests (Vitest)
pnpm check                  # TypeScript check
pnpm build                  # Production build
pnpm db:migrate             # Apply migrations

uv run --python 3.12 devtools/gate.py   # Full gate (check + test + build)
```

## Architecture

**BYOK identity**: Browser encrypts OpenRouter key locally. Server derives `byok_id = sha256(key)` per request, never persists keys.

**Three-phase orchestration**:
- Phase 1: 6 reviewers (A–F) respond in parallel
- Phase 2: 6 reviewers critique each other
- Phase 3: 1 synthesizer (G) produces verdict

**Server layout**:
```
server/
├── _core/       # Express, tRPC, config, logging
├── edges/trpc/  # tRPC routers
├── workflows/   # Orchestration (3-phase inference)
├── services/    # Domain helpers
├── domain/      # Pure types (no I/O)
├── adapters/    # External HTTP (no DB)
└── stores/      # SQLite persistence (no HTTP)
```

**Client layout**:
```
client/src/
├── pages/       # Route components
├── features/    # Feature modules (sessions, councils)
├── components/  # Shared UI
└── lib/         # Routing, tRPC client
```

**Database**: SQLite via better-sqlite3 + Drizzle. Schema in `drizzle/schema.ts`.

## Key Files

- `server/workflows/orchestration.ts` — three-phase orchestration
- `server/edges/trpc/queryRouter.ts` — query submission endpoint
- `client/src/features/sessions/components/RunSheet.tsx` — run detail UI
- `ARCH.md` — canonical architecture docs

## Conventions

- Only `server/_core/runtimeConfig.ts` reads `process.env`
- Styling: CSS tokens, no inline styles
- Max 500 lines / 18KB per file (enforced by gate)
- Sessions snapshot council config at submit time
