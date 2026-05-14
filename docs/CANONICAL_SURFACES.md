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
- Local secrets: `.env.local` owns the unprefixed runtime variables consumed by
  the app. Workstation-specific secret managers may materialize or symlink that
  file, but tracked product docs do not require a private home path. Local
  operator commands ignore ambient shell overrides for reserved runtime keys.
- Database: `packages/db/src/schema.ts` and `packages/db/drizzle/0000_init.sql`
  own the squashed launch schema.
- Operator commands: `pnpm local:*` owns local doctor, bootstrap, database, gate,
  and live-proof flows. `pnpm dev` is only an alias for `pnpm local:dev`.
- Local HTTP projection: `tools/local-http.ts` owns free-port materialization,
  `tools/next-dev.ts` owns launch-owned Next dev isolation, and
  `tools/local-dev.ts` plus `devtools/gate.py` consume that projection for local
  dev, local live proof, and full-gate browser proof.
- Gate projection: `pnpm local:gate --full` clears reserved runtime/projection
  keys before invoking `devtools/gate.py`; the gate materializes its own
  browser-proof projection.

## Contract Owners

- Public HTTP routes are the entries exported from
  `packages/contracts/src/http/registry.ts`; route rows live in
  `packages/contracts/src/http/registryRoutes.ts`.
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
- Demo logout authority is the revocation state on the matching
  `demo_sessions` row; cookie clearing follows successful server revocation.
- Cookie-auth mutating routes enforce same-origin admission only when demo-cookie
  authority is admitted for a cookie-capable route. BYOK routes remain
  header-based and report `demo_not_allowed` when a demo cookie reaches a
  BYOK-only route.
- Rate limiting runs before DB user creation and demo-session lookup.

## Provider Owners

- Built-in councils use current OpenRouter model IDs and tier-owned reasoning
  defaults from `packages/config/src/builtInCouncils.ts`.
- Founding is the BYOK best-of-best roster. Provider diversity is only a
  tie-breaker after current quality evidence; Lantern is the declared mid-tier
  bridge, Commons is the paid low-cost demo roster, and all 21 built-in model
  IDs are distinct across the three tier clusters. Position 7 is the strongest
  model in its tier and owns synthesis.
- Commons uses nonzero-priced model IDs and excludes `:free`, `~latest`,
  preview aliases, expiring catalog rows, and rows above the current selected
  GPT-5 Mini blended row ceiling.
- Runtime provider execution snapshots catalog-supported parameters before each
  OpenRouter call.
- Unsupported non-null tuning is denied before provider execution and records
  provider-call diagnostics.
- Public error envelopes redact credential-like material in both top-level
  messages and typed detail fields before they reach HTTP callers or UI
  diagnostics.
- Phase-2 review execution requires structured-output support and sends the
  contracts-owned compact review-array JSON schema as `response_format`;
  unsupported review models are denied before provider execution, and the app
  parser remains the semantic owner for candidate count, score range, list
  bounds, material prose, and length limits.
- Prompt hydration joins role instructions and output contracts with one
  canonical separator. Phase-2 JSON payload strings and compact phase-3
  synthesis-material payload strings are reference data rather than new
  instruction surfaces.

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
- prompt materialization drift where stored whitespace changes the hydrated
  system instruction.

The gate must not reject arbitrary prose just because it names a historical
surface. Replacement maps and handoffs may mention prior surfaces when that
clarifies why the current owner exists.
