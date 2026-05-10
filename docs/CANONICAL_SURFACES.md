# Canonical Surfaces

This document declares what The Seven owns at launch. Validation proves these
owners directly; it does not scan the repository for every possible thing the
app is not.

## Runtime Owners

- Web runtime: `apps/web` on Next App Router with Node route handlers.
- CLI runtime: `apps/cli` using the `/api/v1` HTTP contract.
- Contracts: `packages/contracts` owns HTTP route rows, schemas, envelopes, and
  typed error details.
- Configuration: `packages/config` owns env/profile materialization and built-in
  councils.
- Local secrets: `/Users/tiziano/.secrets/ALL.env` owns human-entered
  `THE_SEVEN__...` values, `/Users/tiziano/.secrets/the-seven.env` owns the
  generated app slice, and `.env.local` points at that slice.
- Database: `packages/db/src/schema.ts` and `packages/db/drizzle/0000_init.sql`
  own the squashed launch schema.
- Operator commands: `pnpm local:*` owns local doctor, bootstrap, database, gate,
  and live-proof flows.

## Contract Owners

- Public HTTP routes are the entries in
  `packages/contracts/src/http/registry.ts`.
- Route files under `apps/web/src/app/api/v1/**/route.ts` adapt registry rows to
  `NextResponse`; they do not define public contracts independently.
- Registry schemas parse route inputs once; handlers receive transformed params,
  query, and body values directly.
- Response envelopes and error-detail constructors come from
  `packages/contracts/src/http`.
- Session identity for session subresources is the `[sessionId]` path parameter.
- Ingress metadata is admitted before auth. Server trace IDs are canonical audit
  truth.

## Auth Owners

- BYOK authority is per-request `Authorization: Bearer <OpenRouter key>` after
  OpenRouter key validation.
- Demo authority is the `seven_demo_session` web cookie issued by
  `GET /api/v1/demo/consume`.
- Cookie-auth mutating routes enforce same-origin admission. BYOK routes remain
  header-based.
- Rate limiting runs before DB user creation and demo-session lookup.

## Provider Owners

- Built-in councils use current OpenRouter model IDs and model-specific tuning
  defaults from `packages/config/src/builtInCouncils.ts`.
- Founding is the BYOK best-of-best roster, Lantern is the declared mid-tier
  bridge, and Commons is the paid low-cost demo roster.
- Commons uses nonzero-priced model IDs and excludes `:free`, `~latest`,
  preview aliases, and expiring catalog rows.
- Runtime provider execution snapshots catalog-supported parameters before each
  OpenRouter call.
- Unsupported non-null tuning is denied before provider execution and records
  provider-call diagnostics.

## Operator Validation Owners

- `devtools/gate.py` proves owned file guardrails, squashed DB posture, canonical
  root ownership, package-manifest boundaries, and exact active contract tokens.
- `pnpm local:doctor` proves minimal local development readiness.
- `pnpm local:doctor --live` and `pnpm local:live` prove live-provider readiness
  only when live keys and secret hygiene are present.

## Gate Boundary

The gate may reject:

- root entries that conflict with the owners above,
- package dependencies that would reintroduce a parallel runtime/toolchain,
- exact stale executable tokens in files that own live behavior.

The gate must not reject arbitrary prose just because it names a historical
surface. Replacement maps and handoffs may mention prior surfaces when that
clarifies why the current owner exists.
