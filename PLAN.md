# Plan

## Remaining Milestones

- Ship the canonical local Mac operator surface:
  - add `compose.yaml` for the local Postgres runtime
  - add `tools/local-dev.ts` for doctor/bootstrap/db/dev/gate/live commands
  - add `.env.local.example` and retire `.env`-driven runtime scripts
- Ship the provider-backed local live suite:
  - add `pnpm test:live`
  - add temporary Resend webhook + inbound-message retrieval coverage
  - run browser e2e against an externally started local app
- Re-run validation on the canonical local stack:
  - `pnpm local:doctor`
  - `pnpm local:db:up`
  - `pnpm run db:bootstrap:check`
  - `uv run devtools/gate.py`
