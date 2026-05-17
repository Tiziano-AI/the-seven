# Validation Matrix

This is the required verification pyramid for the launch-candidate milestone.

## Unit and Domain

- environment profile parsing and requiredness
- BYOK crypto roundtrip and auth-store semantics
- demo cookie serialization and clearing
- council draft validation
- attachment count, filename, byte, extension/MIME mismatch, detected
  unsupported MIME, parser-timeout, and extracted-char denials
- prompt snapshot construction
- redaction mapper behavior
- error-detail constructors and envelope builders
- job credential HKDF/AES-GCM encrypt/decrypt with AAD mismatch denial

## Contract

- every `/api/v1` route registry entry declares method, path, resource, auth
  policy, schemas, success payload, and denial rows
- every JSON route success envelope validates against the registry payload
- every JSON route typed error path validates against the error envelope
- JSON API success and error envelopes carry `Cache-Control: no-store`, and
  `X-Trace-Id` matches envelope `trace_id`
- invalid path params, invalid query, invalid body, invalid ingress, and missing
  auth denials include a server trace header
- public request body schemas reject extra keys instead of stripping them
- transformed path params such as council `locator` reach handlers as parsed
  contract values and are not parsed a second time
- continue and rerun bodies do not duplicate `sessionId`; path params own session
  identity
- BYOK auth, demo-cookie auth, missing-auth, and `demo_not_allowed` denials are
  distinct
- demo Commons-only enforcement
- council CRUD validation
- submit, continue, rerun, diagnostics, and export payloads

## Auth and Security

- invalid BYOK cannot create a user, list councils, enqueue sessions, or write
  jobs
- provider validation transport failure does not mutate DB and maps to public
  `502 upstream_error` with upstream status retained only in diagnostics
- spoofed proxy/trace headers cannot bypass rate limits or replace server trace
  truth
- invalid `X-Seven-Ingress` and multiline or oversized ingress version deny as
  `invalid_input`
- cookie-demo mutating routes enforce same-origin checks, accept only local HTTP
  loopback aliases on the same non-production port, and reject contradictory
  explicit origin evidence before accepting Fetch Metadata fallback
- BYOK routes remain header-based
- HTTP errors, DB diagnostics, logs, and UI diagnostics are redacted

## Demo

- magic-link request creates one email link
- `GET /api/v1/demo/consume` validates token, sets a cookie, and redirects to
  `<SEVEN_PUBLIC_ORIGIN>/`
- API-ingress token reuse, expired token, missing token, blank token, and
  whitespace-only token return typed denials; browser-ingress blank and
  whitespace-only demo links redirect to the demo-link recovery state
- browser-ingress missing, reused, expired, invalid, or disabled demo links
  redirect to the public origin with a recovery state
- malformed demo consume `Host` authority denies before rate-limit or token
  mutation
- browser demo authority is the server-issued cookie
- revoked demo cookies deny as `invalid_token`
- demo mode remains Commons-only

## Provider

- built-in councils validate against a mocked 2026-05-16 OpenRouter catalog
- Founding uses current best-of-best OpenRouter model IDs for BYOK and treats
  provider diversity as a tie-breaker only
- each built-in tier uses position 7 as the final-answer policy seat
- Lantern uses a declared mid-tier bridge roster rather than leftovers
- Commons uses paid low-cost demo model IDs with nonzero pricing and no
  `:free`, `~latest`, preview aliases, catalog expiration date, or row above the
  current selected GPT-5 Mini blended row ceiling
- all 21 built-in model IDs are distinct across tier clusters
- OpenRouter catalog refresh persists catalog expiration dates and maximum
  completion-token metadata
- unsupported built-in tuning defaults are `null`
- unsupported non-null user tuning is denied before provider execution
- built-in tier effort materializes through OpenRouter `reasoning.effort`, and
  provider diagnostics expose the sent effort value: Commons `low`, Lantern
  `medium`, Founding `xhigh`
- every OpenRouter call sends the phase-owned server `max_tokens` cap
  (8192/16384/16384) and denies models that do not support that required request
  parameter or publish a lower maximum completion-token cap
- chat completions use the OpenRouter streaming transport internally while
  preserving the stored complete-response artifact contract
- phase-2 review calls require `response_format` and `structured_outputs`, record
  the exact missing capability list on denial, and send the compact
  provider-facing `response_format` with provider parameter enforcement plus
  prompt-visible candidate count, score, item-count, and string-length bounds
- phase-3 synthesis calls receive compact synthesis material rather than the
  canonical persisted phase-2 review object; exact phase-3 probes and full live proof own
  synthesizer acceptance
- supported tuning is sent
- retryable OpenRouter choice-level upstream errors retry before a terminal
  provider-call result is recorded, and final structured retry failures still
  persist response ID/model plus choice-error diagnostics
- OpenRouter's fifteen-minute request timeout covers response-body consumption after
  headers and records a typed timeout instead of leaving the job leased
  indefinitely
- successful streaming responses may omit the chunk-level `model`; diagnostics
  fall back to the exact requested model only when a generation ID is present
- OpenRouter/Resend errors are redacted
- provider diagnostics persist requested model, catalog freshness, supported
  params, sent params, denied params, requested output cap, sent reasoning
  effort, sent OpenRouter provider-routing controls, upstream status/code,
  response model, generation ID, and finite billing lookup status without secrets
- failed session detail and diagnostics expose the redacted terminal job error
  as `terminalError` so parser/provider blockers are visible in proof output

## Database

- schema constraints
- one squashed init migration
- transaction semantics for submit with decoded attachments, atomic
  failed-session continue, and rerun with copied source artifacts
- job claim, lease renewal, expiry, reclaim, and max-attempt terminalization
- lease-loss cancellation and active-lease verification before processing
  transitions, provider egress, artifact writes, and diagnostic writes
- job-only and claimed terminal writes deny after lease expiry
- rate-limit buckets
- session snapshot integrity
- prompt materialization inserts one canonical separator between phase
  instructions and output contracts
- provider-call persistence
- credential decrypt failure
- invalid snapshot failure
- concurrent-start denial

## Workflow

- full fresh session
- partial-artifact resume
- completed-session idempotency
- rerun isolation, including distinct queued session/job creation and rollback
  on credential materialization failure
- provider rate-limit surfacing
- phase-2 evaluation JSON validates, normalizes, and rejects duplicate, missing,
  or extra candidate review rows, invalid scores, overlarge lists, overlong
  strings, and placeholder prose before phase 3; prompt projection tests assert
  that provider-visible instructions mirror these parser-owned bounds
- phase-2 and phase-3 JSON payload builders preserve hostile strings as data
  and do not create delimiter-based instruction surfaces
- bounded retry behavior
- restart recovery from leased jobs until max attempts, then terminal failure
- DB and supervisor startup terminalization of abandoned terminal-session
  billing lookup diagnostics after bounded recovery retry, while nonterminal
  pending rows remain untouched

## Browser

Full-gate browser proof uses deterministic mocked API acceptance for UI-only
state transitions. `pnpm local:live` projects the live authenticated smoke state
and proves demo-cookie server authority, End demo revocation, and stale-cookie
denial against the running app.

- BYOK setup, unlock, and lock
- stored BYOK browsers see the unlock path before demo email, with password
  manager hints on BYOK and unlock fields; unlocking the stored key must prove
  subsequent BYOK-only requests carry the restored `Authorization` header
- demo magic-link request renders a durable receipt; live proof owns provider
  email delivery and cookie consumption
- demo magic-link request, BYOK unlock/setup, question submission, and run again are
  form-owned submit surfaces with in-flight duplicate-submit guards
- demo magic-link email admission uses email autofill and blocks syntactically
  invalid addresses before the request
- visible demo sessions self-expire at the server-issued expiry time and return the
  workbench to the locked state
- End demo waits for server logout, clears the cookie, locks the UI, and proves
  the stale cookie no longer authorizes `GET /api/v1/demo/session`
- BYOK admission selects Founding so the demo-only Commons roster does not
  remain the accidental paid-key default
- question submission with attachments, including server-side decoded-text snapshot
  persistence and submit-boundary denial before enqueue for unsupported detected
  MIME
- evidence upload renders as a product-owned exhibit picker, not native file
  chrome
- selected exhibits can be removed one-by-one or cleared as a set before submit
- council/run-again council, archive status, and tuning choices expose native radio
  semantics rather than pressed-button exclusivity
- rendered primary labels are plain-language task labels; the medieval metaphor
  stays in visual treatment, not required vocabulary
- question, answer, inspection modes, and recovery record render as navigable
  headings
- authenticated and locked route entries expose one page-level heading
- failed-run recovery and status surfaces map internal failure enums to
  operator-facing language
- answer and inspection markdown wraps long prose, URLs, inline code, and table
  cells while preserving scroll for code blocks and tables
- Workbench puts the question before council mechanics, keeps council/evidence
  controls progressively disclosed, and keeps Ask another question / Edit and
  run again near the completed answer
- the answer-first inspector uses one stable action rail across processing,
  completed, failed, Archive-selected, and deep-linked states; buttons do not
  change size, shape, or position as state changes
- inspector modes are progressive disclosure surfaces: Answer, How it worked,
  Council, Run details, Exports, and Run again
- How it worked starts from phase/seat summaries and expands drafts, critiques,
  scores, strengths, weaknesses, critical errors, missing evidence,
  final-answer input, major disagreements, and final-answer inputs on demand
- Council renders seven readable seats without raw provider IDs as the primary
  label
- council editor model slots render product-owned catalog suggestions, readable
  model names as primary identity, and provider IDs only as evidence
- council editor validates model catalog rows and hides unsupported tuning
  controls before save
- Council settings are reached through Manage councils and are not equal-weight
  top navigation for demo/default users
- Run details member cells render seat alias/role rather than bare member
  position integers
- Run details renders capability admission, sent/denied parameters,
  provider route, billing status, response ID, and error status/code
- Run details begins with a run-level summary that separates accepted
  provider outputs from failed or denied attempts and from unsettled billing
  attempts
- Run details loading scrolls to the call ledger so the user sees the
  receipt that was requested
- copy/export proof covers Copy answer, Copy answer with notes, Copy private
  link, Download answer, Download full record, and Archive Export selected with
  count-aware labels plus row-level Add/Remove export actions; the private-link
  copy states that it reopens the run for the current account
- Archive rows open/select only; recovery and run-again actions are detail-owned
  after the preserved work and reused inputs are visible
- Archive loads ledger-first without arbitrary auto-selection; mobile Archive
  renders the selected run before the archive list once a row is opened, so
  focused answer, recovery, and Run details proof starts at the requested
  question
- Run details fixtures mirror runtime-real diagnostics rows: phase-1
  success sends `max_tokens,reasoning`, phase-2 structured success sends
  `max_tokens,reasoning,response_format` with pending billing settlement,
  pre-egress capability denial sends no provider parameters or upstream status,
  and upstream errors do not mix denied parameters with provider transport
  failures
- review-signal copy is correct for no rankings, one ranking, unanimous
  rankings, split rankings, dissent, and synthesis; answer copy states that
  Synthesizer G resolves by evidence and correctness rather than majority rank
- archive export proof asserts both generated selected-run files, suggested
  filenames, and contents
- Run again proof covers original-council default selection, unchanged-question
  submissions, edited `queryOverride` submissions, explicit council changes, and
  blank edited-question recovery before any cost-bearing request
- active runs show pending token/cost evidence instead of final-looking zero
  usage
- rendered desktop, tablet, and mobile proof covers locked gate, demo receipt,
  ask composer, BYOK composer, submitted Workbench, Archive, processing run,
  completed answer, How it worked, Run details, failed recovery, export/copy
  panel, run-again panel, and seat-first council settings
- mobile proof includes focused viewport captures for demo receipt, submitted
  Workbench, processing run, completed answer, Run details, failed recovery, and
  export/copy panel, plus full-page captures for long-surface continuity
- rendered proof includes at least one explicit state transition: ask submission
  to processing, completed-answer mode switching, copy/download affordance
  visibility, Archive row open, or run-again preparation
- the rendered proof directory regenerates a contact sheet from the fresh proof
  set for visual review
- answer candidate/reviewer chips route to the canonical seat/How it worked
  evidence anchors
- How it worked renders full phase-2 critique substance, not only scores, when
  expanded
- council duplicate, edit, save, and delete
- sessions search, add/remove export selection, open detail, and export selected
- session detail deep link
- continue failed run from the detail recovery panel
- failed-run recovery copy distinguishes Continue with the original council
  from Run again with the selected council
- run again from the detail Run again panel

## Local Operator

- `pnpm dev`, `pnpm local:dev`, `pnpm local:live`, and full-gate e2e allocate a free
  loopback HTTP port instead of requiring `127.0.0.1:3000`
- local proof projects one consistent `PORT` and `SEVEN_BASE_URL`
- loopback `SEVEN_PUBLIC_ORIGIN` is materialized to the allocated local port;
  explicit non-loopback public origins are preserved
- local operator preflight reads reserved runtime keys from `.env.local` rather
  than ambient shell overrides
- `pnpm local:gate --full` scrubs reserved runtime/projection keys before
  build/test phases and lets full-gate e2e materialize its own projection
- `devtools/gate.py` runs Next route type generation before TypeScript checks so
  clean checkouts do not depend on ignored `.next/types` cache state
- local proof isolates Next's dev `distDir` so an existing `apps/web`
  `.next/dev/lock` cannot break a launch-owned browser proof
- local proof disables Next's development indicator so screenshots contain
  product UI, not framework debugging chrome
- rendered proof uses locally bundled fonts, not runtime Google Fonts fetches
- `pnpm local:live` refuses to run while another same-repo `pnpm local:dev` or
  `next dev` worker can claim jobs from the same database
- Playwright self-start mode never reuses an ambient server; external-server
  mode is explicit

- `pnpm local:doctor` verifies:
  - Homebrew presence
  - Docker daemon and Compose availability
  - Node, pnpm, and uv
  - `psql` and `pg_isready`
  - Playwright browser availability
  - `DATABASE_URL` targets the canonical local Postgres authority
  - `127.0.0.1:5432` is either free for `the-seven-postgres` or already owned
    by it
  - effective `.env.local` presence
  - minimal development keys
  - secret-slice mode no broader than `0600`
  - no placeholder credential values
- `pnpm local:doctor --live` verifies the same local readiness plus live BYOK,
  demo OpenRouter, Resend, sender, and test-inbox key presence
- workstation-specific secret-manager doctors are outside the tracked product
  contract; The Seven consumes only the resulting `.env.local` variable names,
  values, and file mode
- `pnpm local:bootstrap -- --install` installs missing Homebrew-managed
  prerequisites and Playwright browsers
- `pnpm local:db:up` fails fast if `DATABASE_URL` points outside local compose
  Postgres or if another service owns `127.0.0.1:5432`, otherwise waits for a
  healthy compose-managed Postgres instance. A blank database is accepted. A
  database with stale The Seven tables fails closed and instructs the operator
  to run `pnpm local:db:reset`.
- `pnpm local:db:reset` destroys the named volume and returns a blank database
- `pnpm run db:bootstrap:check` verifies the squashed init migration against an
  isolated schema and fails fast if the canonical compose-managed database is
  not the active Postgres owner

## Live

- `pnpm test:live` asserts:
  - BYOK auth validate against real OpenRouter
  - every built-in model ID validates through the live catalog path
  - model autocomplete through the live catalog path
  - council CRUD against the local app and local Postgres
  - demo Commons submit before the heavy BYOK completion sequence, then session
    submit for every built-in BYOK tier plus `completed` terminal-state
    polling, diagnostics retrieval, and no remaining pending billing lookup
    diagnostics after bounded billing recovery
  - completed BYOK and demo sessions include the exact selected built-in roster
    in the run snapshot, six nonblank phase-1 response artifacts, six phase-2
    review artifacts, schema-valid material review prose, one nonblank phase-3
    synthesis artifact from the tier synthesizer, and successful provider-call
    diagnostics for six phase-1 calls, six phase-2 calls, and the member-7
    phase-3 synthesizer call
  - provider-call diagnostics match the exact model ID for each expected roster
    position, include catalog freshness, supported `reasoning`/`max_tokens`, the
    tier-owned sent reasoning effort, sent `provider.require_parameters`, sent
    `provider.ignore` for `amazon-bedrock` and `azure`, no denied parameters,
    response IDs/models, no provider or choice errors, and exact
    8192/16384/16384 provider output caps across expected phase calls
  - phase-2 provider-call diagnostics include supported `response_format` and
    `structured_outputs`, sent `response_format`, and provider parameter
    enforcement
  - demo request/consume through real Resend outbound email plus Receiving API
    listing and body retrieval
  - every JSON API proof response used by live demo-cookie calls carries
    `Cache-Control: no-store`, and logout/stale-cookie proof verifies
    `X-Trace-Id` equality with envelope `trace_id`
  - BYOK and demo sessions must reach `completed`; failed sessions with provider
    diagnostics and redacted `terminalError` are evidence for debugging, not
    launch proof
  - demo proof cannot be skipped by environment flag
- `pnpm local:live` additionally asserts:
  - `pnpm local:doctor --live`
  - Playwright browser coverage against the externally started local server

## Gate

The final delivery gate is:

```bash
pnpm local:doctor
pnpm local:db:up
pnpm run db:bootstrap:check
pnpm local:gate --full
```

Live proof runs when live keys are present:

```bash
pnpm local:doctor --live
pnpm local:db:reset
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

## Production Release Smoke

After Railway deployment reports success, public smoke proves the public surface
without provider, email, or authenticated side effects:

- `GET https://theseven.ai/` returns a rendered app response.
- unauthenticated `GET https://theseven.ai/api/v1/demo/session` returns the
  declared 401 error envelope with a server trace header through the normal
  ingress and rate-limit path.
- the unauthenticated API response carries `Cache-Control: no-store`.

The executable public smoke command is:

```bash
pnpm public:smoke https://theseven.ai
```
