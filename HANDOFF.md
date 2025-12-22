# Handoff

Current state for contributors picking up work.

## State

- Demo flow fails: `POST /api/demo/request` returns 500 (`internal_error` toast).
- BYOK validation crashes the dev server: `POST /api/auth/validate` yields `net::ERR_EMPTY_RESPONSE`, and the server stops listening on `localhost:3000`.
- Local SQLite schema is missing demo tables even though the baseline migration tag exists.
- Gates not run (no code changes yet).

## Evidence

- `sqlite3 data/the-seven.db ".tables"` shows: `__seven_migrations`, `users`, `councils`, `councilMembers`, `sessions`, `memberResponses`, `memberReviews`, `memberSyntheses`, `modelsCache`, `pricingCache`, `openRouterCalls` — **missing** `demoAuthLinks`, `demoSessions`, `rateLimitBuckets`.
- `sqlite3 data/the-seven.db "select tag, appliedAt from __seven_migrations"` returns `0000_init|1766243269727` (migration recorded, so `pnpm db:migrate` is noop).
- Chrome devtools demo request: `POST /api/demo/request` → 500 with `trace_id=f64c9ec4-9211-493f-899b-a8d586649ef3`, `error_id=9aadfdad-9217-4878-8229-86d35f58f411`.
- Chrome devtools BYOK validation: `POST /api/auth/validate` → `net::ERR_EMPTY_RESPONSE`; subsequent `curl http://localhost:3000/` fails (server no longer listening).

## Blockers

- Need to restart `pnpm dev` to continue exercising demo/BYOK flows.
- Need a decision on how to repair the local DB schema (drop/recreate vs. add migration/backfill for missing demo tables).

## Next Actions

1. Restart `pnpm dev` and reproduce the demo request + BYOK validate flows while capturing server logs.
2. Decide on DB repair strategy:
   - Dev-only: delete `data/the-seven.db` and rerun `pnpm db:migrate` (destructive).
   - Code fix: add a migration path or enforce baseline table completeness instead of silent noop.
3. Re-test demo magic link flow and BYOK key validation after the DB fix; capture new trace IDs/errors.
