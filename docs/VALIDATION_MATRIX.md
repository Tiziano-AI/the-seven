# Validation Matrix

This is the required verification pyramid for the rewrite.

## Unit and Domain

- env parsing and defaulting
- BYOK crypto roundtrip and auth-store semantics
- council draft validation
- attachment decoding and denial paths
- prompt snapshot construction
- error mapping and envelope builders

## Contract

- every `/api/v1` route success envelope
- every `/api/v1` route typed error path
- BYOK auth, demo auth, and missing-auth denials
- demo Commons-only enforcement
- council CRUD validation
- submit, continue, rerun, diagnostics, and export payloads

## Database

- schema constraints
- one squashed init migration
- transaction semantics for submit/continue/rerun
- job claim, lease renewal, expiry, and reclaim
- session snapshot integrity
- provider-call persistence

## Workflow

- full happy-path orchestration
- partial-artifact resume
- completed-session idempotency
- rerun isolation
- provider rate-limit surfacing
- concurrent claim denial
- bounded retry behavior
- restart recovery from leased jobs

## Browser

- BYOK onboarding, password setup, unlock, lock
- demo magic-link request and consume
- ask flow with attachments
- council duplicate/edit/save/delete
- sessions search/filter/select/export
- session detail deep link
- continue failed run
- rerun completed run

## Gate

The final delivery gate is:

```bash
uv run --python 3.12 devtools/gate.py --full

pnpm run lint
pnpm run check
pnpm run test
pnpm run test:e2e
pnpm run build
pnpm run db:bootstrap:check
```

All commands must pass on a blank Postgres database with the current init migration.
