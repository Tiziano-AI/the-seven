# Handoff

No active handoff.

- The greenfield rewrite is complete.
- The canonical stack is the `pnpm` workspace with `apps/web`, `apps/cli`, `packages/contracts`, `packages/config`, and `packages/db`.
- Railway production for service `the-seven` has `DATABASE_URL` and `SEVEN_JOB_CREDENTIAL_SECRET` set for the Postgres runtime.
- Verification passes on a blank Postgres target with:
  - `uv run --python 3.12 devtools/gate.py --full`

Resume only for new work.
