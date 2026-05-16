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
- UI surface: `apps/web/src/app/theme.css` owns tokens; `apps/web/src/app/*.css`
  owns the scholarly workbench class vocabulary; client components under
  `apps/web/src/components/**` own rendered route behavior.

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
- JSON API adapters mark success and error envelopes `Cache-Control: no-store`.
- Session identity for session subresources is the `[sessionId]` path parameter.
- Ingress metadata is admitted before auth. Server trace IDs are canonical audit
  truth.

## Auth Owners

- BYOK authority is per-request `Authorization: Bearer <OpenRouter key>` after
  OpenRouter key validation.
- Demo authority is the `seven_demo_session` web cookie issued by
  `GET /api/v1/demo/consume`.
- Demo logout authority is the revocation state on the matching
  `demo_sessions` row. The route clears the cookie after successful server
  revocation or after a typed `401` proof that the cookie no longer maps to
  admitted demo authority; same-origin admission failures do not clear it.
- Demo-cookie mutating routes enforce same-origin admission before route input
  parsing and before cookie-auth denial. Any-auth mutating routes enforce the
  same-origin gate when the resolved authority is demo. BYOK routes remain
  header-based and report `demo_not_allowed` when a demo cookie reaches a
  BYOK-only route.
- Rate limiting runs before DB user creation and demo-session lookup.

## Provider Owners

- Built-in councils use current OpenRouter model IDs and tier-owned reasoning
  defaults from `packages/config/src/builtInCouncils.ts`.
- Founding is the BYOK best-of-best roster. Provider diversity is only a
  tie-breaker after current quality evidence; Lantern is the declared mid-tier
  bridge, Commons is the paid low-cost demo roster, and all 21 built-in model
  IDs are distinct across the three tier clusters. Position 7 is the
  final-answer policy seat and owns synthesis.
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
  root ownership, package-manifest boundaries, canonical Next route type
  materialization before TypeScript checks, and exact active contract tokens.
- `pnpm local:doctor` proves minimal local development readiness.
- `pnpm local:doctor --live` and `pnpm local:live` prove live-provider readiness
  only when live keys and secret hygiene are present.

## UI Owners

- `/` owns the Petition Desk and active Run Workbench.
- The locked Petition Desk gate presents a stored BYOK unlock first when this
  browser has an encrypted key; the demo magic-link request is primary only for
  browsers without a stored key.
- `/councils` owns the Council Library/editor.
- `/sessions` owns the Archive ledger. It loads ledger-first and opens a
  manuscript only from row activation, deep link, or explicit restored
  selection.
- `/sessions/[sessionId]` owns one deep-linked Manuscript.
- The visual contract is the scholarly council workbench: docket language,
  proceedings, verdict article, provider record, archive rows, sigils, seals,
  ruled folio surfaces, small radii, and readable typography.
- Every UI route owns a page-level heading. Workbench cards may lead visually,
  but screen-reader navigation still starts from the route owner.
- Petition, demo request, BYOK unlock, and rerun submissions are form-owned.
  Blank rerun matter is handled before request submission instead of relying on
  raw schema-error recovery.
  Exclusive council/filter/tuning choices use radio semantics. Evidence is a
  product-owned exhibit picker with keyboard selection, drag/drop, selected
  exhibit ledger, per-exhibit removal, and clear-all recovery.
- The medieval/display face is not a UI chrome font. It is reserved for the
  wordmark, seat letters, selected title plates, and verdict drop-caps.
- Typography is locally bundled through `next/font/local`; rendered proof and
  production builds do not depend on Google Fonts network fetches.
- Council model selection is a workbench combobox ledger. Human model names are
  primary, exact provider IDs are secondary evidence, and no browser-default
  datalist/dropdown chrome owns the editable seat surface.
- Council tuning is capability-driven. The editor validates each selected model
  against the catalog, prunes unsupported saved tuning, and renders only controls
  backed by supported provider parameters.
- Demo seals are server-issued cookie authority and client-visible UI state.
  They self-expire at the server timestamp and are rechecked when the tab is
  shown; expired seals return the workbench to the locked state.
- BYOK admission selects Founding before the paid-key session starts so Commons
  does not remain the accidental default for a paid-key run.
- Provider Record, Continue, and Rerun controls own visible state transitions:
  Provider Record scrolls to the loaded call ledger; Continue states that it
  uses the original council; Prepare Rerun opens a docket, and the final Run
  Again submit states that it uses a freshly chosen council.

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
