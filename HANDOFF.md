# Handoff

Current state for contributors picking up work.

## State

- Demo and BYOK auth flows were not re-verified in this session; prior failures remain unconfirmed.
- Local SQLite schema now includes demo tables.
- Gates run: `uv run --python 3.12 devtools/gate.py` (pass).

## Evidence

- `sqlite3 data/the-seven.db ".tables"` now includes `demoAuthLinks`, `demoSessions`, `rateLimitBuckets`.
- No dev server run in this session; no new trace IDs captured.

## Blockers

- Need valid OpenRouter + Resend credentials to exercise `/api/auth/validate` and `/api/demo/request`.
- Need to run `pnpm dev` and capture logs during requests.

## Next Actions

1. Start `pnpm dev` and reproduce `/api/auth/validate` with a real key and `/api/demo/request` with demo enabled; capture server logs + trace IDs.
2. If failures persist, map trace IDs to code paths and document fixes.
