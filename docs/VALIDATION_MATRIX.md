# Validation Matrix

This is the required verification pyramid for the launch-candidate milestone.

## Unit and Domain

- environment profile parsing and requiredness
- BYOK crypto roundtrip and auth-store semantics
- demo cookie serialization and clearing
- council draft validation
- attachment count, filename, byte, MIME, parser-timeout, and extracted-char
  denials
- prompt snapshot construction
- redaction mapper behavior
- error-detail constructors and envelope builders
- job credential HKDF/AES-GCM encrypt/decrypt with AAD mismatch denial

## Contract

- every `/api/v1` route registry entry declares method, path, resource, auth
  policy, schemas, success payload, and denial rows
- every JSON route success envelope validates against the registry payload
- every JSON route typed error path validates against the error envelope
- invalid path params, invalid query, invalid body, invalid ingress, and missing
  auth denials include a server trace header
- transformed path params such as council `locator` reach handlers as parsed
  contract values and are not parsed a second time
- continue and rerun bodies do not duplicate `sessionId`; path params own session
  identity
- BYOK auth, demo-cookie auth, and missing-auth denials are distinct
- demo Commons-only enforcement
- council CRUD validation
- submit, continue, rerun, diagnostics, and export payloads

## Auth and Security

- invalid BYOK cannot create a user, list councils, enqueue sessions, or write
  jobs
- provider validation transport failure does not mutate DB and maps to
  `upstream_error`
- spoofed proxy/trace headers cannot bypass rate limits or replace server trace
  truth
- invalid `X-Seven-Ingress` and multiline or oversized ingress version deny as
  `invalid_input`
- cookie-demo mutating routes enforce same-origin checks
- BYOK routes remain header-based
- HTTP errors, DB diagnostics, logs, and UI diagnostics are redacted

## Demo

- magic-link request creates one email link
- `GET /api/v1/demo/consume` validates token, sets a cookie, and redirects to
  `/`
- token reuse, expired token, and missing token return typed denials
- browser demo authority is the server-issued cookie
- legacy demo header ingress returns a typed denial
- demo mode remains Commons-only

## Provider

- built-in councils validate against a mocked 2026-05-10 OpenRouter catalog
- Founding uses current best-of-best OpenRouter model IDs for BYOK and treats
  provider diversity as a tie-breaker only
- Lantern uses a declared mid-tier bridge roster rather than leftovers
- Commons uses paid low-cost demo model IDs with nonzero pricing and no
  `:free`, `~latest`, preview aliases, or catalog expiration date
- all 21 built-in model IDs are distinct across tier clusters
- unsupported built-in tuning defaults are `null`
- unsupported non-null user tuning is denied before provider execution
- phase-2 review calls require OpenRouter structured-output support and send
  `response_format` with provider parameter enforcement
- supported tuning is sent
- OpenRouter/Resend errors are redacted
- provider diagnostics persist requested model, catalog freshness, supported
  params, sent params, denied params, upstream status/code, response model,
  generation ID, and billing lookup status without secrets

## Database

- schema constraints
- one squashed init migration
- transaction semantics for submit/continue/rerun
- job claim, lease renewal, expiry, and reclaim
- rate-limit buckets
- session snapshot integrity
- provider-call persistence
- credential decrypt failure
- invalid snapshot failure
- concurrent-start denial

## Workflow

- full fresh session
- partial-artifact resume
- completed-session idempotency
- rerun isolation
- provider rate-limit surfacing
- phase-2 evaluation JSON validates, normalizes, and rejects missing, extra, or
  duplicated candidate IDs before phase 3
- bounded retry behavior
- restart recovery from leased jobs

## Browser

- BYOK setup, unlock, and lock
- demo magic-link flow through cookie
- ask with attachments
- council duplicate, edit, save, and delete
- sessions search, select, and export
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
  - `127.0.0.1:5432` is either free for `the-seven-postgres` or already owned
    by it
  - effective `.env.local` presence
  - minimal development keys
  - secret-slice mode no broader than `0600`
  - no placeholder credential values
- `pnpm local:doctor --live` additionally verifies live BYOK, demo OpenRouter,
  Resend, sender, and test-inbox key presence
- `tiz-home --json secrets doctor` separately verifies the `ALL.env` master
  pool, `THE_SEVEN__...` source keys, generated app slice, and projection drift
- `pnpm local:bootstrap -- --install` installs missing Homebrew-managed
  prerequisites and Playwright browsers
- `pnpm local:db:up` fails fast if another service owns `127.0.0.1:5432`,
  otherwise waits for a healthy compose-managed Postgres instance
- `pnpm local:db:reset` destroys the named volume and returns a blank database
- `pnpm run db:bootstrap:check` verifies the squashed init migration against an
  isolated schema and fails fast if the canonical compose-managed database is
  not the active Postgres owner

## Live

- `pnpm test:live` asserts:
  - BYOK auth validate against real OpenRouter
  - model validate/autocomplete through the live catalog path
  - council CRUD against the local app and local Postgres
  - session submit plus `completed` terminal-state polling and diagnostics
    retrieval
  - demo request/consume through real Resend outbound email plus Receiving API
    listing and body retrieval
  - BYOK and demo sessions must reach `completed`; failed sessions with provider
    diagnostics are evidence for debugging, not launch proof
- `pnpm local:live` additionally asserts:
  - `pnpm local:doctor --live`
  - Playwright browser coverage against the externally started local server

## Gate

The final delivery gate is:

```bash
pnpm local:doctor
pnpm local:db:up
pnpm run db:bootstrap:check
uv run --python 3.12 devtools/gate.py --full
```

Live proof runs when live keys are present:

```bash
pnpm local:doctor --live
pnpm local:live
```

`pnpm local:live` removes only proof-owned demo rate-limit buckets before the
demo magic-link request so repeated live proofs are deterministic in the same
local database. The cleanup is limited to the configured demo test inbox,
loopback IP scopes, and the demo proof's global demo scopes; route-level rate
limits remain product behavior and are tested separately.

All always-on commands must pass on a blank compose-managed Postgres database
with the current init migration. Live commands must pass before launch when live
keys are available.
