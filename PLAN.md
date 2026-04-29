# Plan

## Remaining Milestones

- Free `127.0.0.1:5432` from any non-`the-seven-postgres` owner so the canonical compose-managed Postgres can start.
- Re-run the launch-candidate closeout gate on the canonical local stack:
  - `pnpm local:doctor`
  - `pnpm local:db:up`
  - `pnpm run db:bootstrap:check`
  - `uv run --python 3.12 devtools/gate.py --full`
  - `pnpm local:live`
