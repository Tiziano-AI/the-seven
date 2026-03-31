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

## Local Operator

- `pnpm local:doctor` verifies:
  - Homebrew presence
  - Docker daemon and Compose availability
  - Node, pnpm, and uv
  - `psql` and `pg_isready`
  - Playwright browser availability
  - `.env.local` presence
  - required live-test keys when provider-backed verification is requested
- `pnpm local:bootstrap -- --install` installs missing Homebrew-managed prerequisites and Playwright browsers
- `pnpm local:db:up` waits for a healthy compose-managed Postgres instance
- `pnpm local:db:reset` destroys the named volume and returns a blank database

## Live

- `pnpm test:live` asserts:
  - BYOK auth validate against real OpenRouter
  - model validate/autocomplete through the live catalog path
  - council CRUD against the local app and local Postgres
  - session submit plus terminal-state polling and diagnostics retrieval
  - demo request/consume through real Resend outbound and inbound retrieval
- `pnpm local:live` additionally asserts:
  - temporary Cloudflare quick tunnel lifecycle
  - temporary Resend webhook creation and deletion
  - Playwright browser coverage against the externally started local server

## Gate

The final delivery gate is:

```bash
pnpm local:doctor
pnpm local:db:up
pnpm run db:bootstrap:check
uv run --python 3.12 devtools/gate.py --full
```

All commands must pass on a blank compose-managed Postgres database with the current init migration.
