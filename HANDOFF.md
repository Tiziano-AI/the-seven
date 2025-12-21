# Handoff

Current state for contributors picking up work.

## State

✓ Gates pass
✓ Deployed
✓ Ready for new work

## Architecture Summary

- **Persistence**: SQLite via better-sqlite3 + Drizzle ORM
- **UX**: Three surfaces (Ask, Journal, Council) with shared RunSheet
- **Deployment**: Railway with GitHub integration (merge → deploy)

## Key Components

- `RunSheet.tsx` — canonical run detail surface
- `SessionResultsLadder.tsx` — phase ladder (Verdict → Critiques → Replies)
- `orchestration.ts` — three-phase orchestration workflow

## Docs

- `ARCH.md` — architecture and contracts
- `README.md` — setup and usage
- `CLAUDE.md` — AI assistant guidance
