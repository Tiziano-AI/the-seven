# Architecture

The Seven is a privacy-first BYOK multi-model council product with one canonical
implementation path:

- one `pnpm` workspace,
- one Next App Router web app on the Node runtime,
- one public HTTP JSON contract under `/api/v1`,
- one durable Postgres-backed orchestration engine,
- one shared contracts/config/database model,
- one local operator surface under `pnpm local:*`.

This document is the canonical technical contract for the launch-candidate
rewrite. The change set is greenfield: superseded HTTP shapes, demo-token
storage, stale model aliases, operator profiles, and validation claims are
deleted instead of shimmed.

## Product Invariants

- BYOK remains browser-owned. Plaintext OpenRouter keys never persist
  server-side; background jobs use envelope-encrypted short-lived credential
  blobs.
- Demo remains zero-friction. Email magic links are consumed by a server GET
  endpoint that issues a 24-hour `HttpOnly` cookie and limits the session to the
  Commons Council.
- Councils remain 7 fixed member slots `A-G`, with shared phase prompts and
  optional per-member tuning.
- Runs remain immutable historical records. Continue resumes missing work inside
  the same failed session. Rerun creates a new session.
- Provider traffic remains server-side. Browsers never call OpenRouter directly.
- Live updates remain polling-based in v1. No parallel realtime transport is
  introduced.

## Prompt and Payload Contract

The app owns council orchestration. Provider models receive only the one-shot
role needed for the current call:

- phase 1 receives a plain assistant instruction plus the user request and
  attachment context;
- phase 2 receives a plain evaluator instruction plus the user request and all
  six candidate answers it must judge;
- phase 3 receives a plain assistant instruction plus the user request,
  candidate answers, and compact phase-2 reviewer summaries.

Default prompts do not expose or narrate orchestration and do not include
vendor-policy boilerplate. They are compact role contracts: answer, evaluate,
and produce the best final answer.

`packages/config/src/prompts.ts` owns the default phase prompt text and output
formats. `apps/web/src/server/workflow/prompts.ts` owns the JSON payloads sent
to phase 2 and phase 3. Phase 2 returns one JSON object; provider-facing structured output uses a
compact `reviews` array with one `candidate_id` row per candidate, and the
workflow normalizes it into the canonical fixed `A` through `F` review object
with one score per candidate before the review artifact is accepted. The workflow derives the
phase-2 ranking from those scores with candidate-order tie-breaking.
`packages/contracts/src/domain/phaseEvaluation.ts` owns the phase-2 count,
material-prose, and length limits. `packages/contracts/src/domain/phasePrompts.ts`
owns prompt and output-format field bounds; the output-format bound admits the
canonical examples in `packages/config/src/prompts.ts` so HTTP council payloads
and session snapshots can round-trip through the public schemas. `packages/config/src/prompts.ts` projects
the compact provider-visible output contract. Phase-2 review
strings are accepted only when they contain material prose with at least two
distinct words and pass the app-owned count, score, and length bounds. Single
letters, numbers, ellipses, and repeated placeholders fail before a review
artifact is persisted. The phase-2 user message states the same candidate-count,
item-count, score, and string-length bounds that the parser enforces, because
current OpenRouter Anthropic routing accepts the portable schema but rejects
richer JSON-schema grammar constraints.
The OpenRouter
adapter requests a bounded `max_tokens` output on every provider call: phase 1
uses 8192 tokens, and phases 2 and 3 use 16384 tokens. Chat completions use
OpenRouter's streaming transport internally so long-running structured-output
calls receive incremental server events instead of depending on one full
non-streaming response body. The workflow still persists artifacts only after
the complete provider response passes schema validation. It requests a phase-2 structured JSON response with provider parameter
enforcement whenever a review call is made. The provider-visible schema uses
only portable structural JSON-schema keywords because current OpenRouter
Anthropic and Mistral endpoints reject rich grammar constraints even when the
model row advertises structured output; the app parser remains the semantic
authority for candidate count, score range, list bounds, material prose, and
length limits. The prompt mirrors those semantic bounds so the provider receives
the contract even when the JSON schema must stay portable. Phase-2 models without `response_format` or `structured_outputs`
support are denied before provider execution with the exact missing capability
names recorded in diagnostics. Phase 3 consumes a
compact synthesis-material projection from parsed evaluation objects plus
explicit reviewer IDs instead of raw reviewer prose or full nested review
objects.

Each phase-2 evaluator receives the same six candidate answers. Candidate
answers and evaluations are payload data, not instruction surfaces.
OpenRouter routing ignores current `Amazon Bedrock` and `Azure` endpoints for
chat completions because live 2026-05-14 probes showed they reject or block the
portable phase-2 structured-output grammar for Anthropic models while direct
Anthropic routing accepts it. The prompt hydrator inserts one canonical blank-line separator between the role
instruction and the output contract, independent of stored whitespace. Phase-2
and phase-3 user messages state that payload strings are reference data, not
new instructions. The canonical protection is structural JSON payloads plus
schema validation, not repo-wide negative string scans.

- Source: `vendor:openai:2026-05-11:https://model-spec.openai.com/2025-04-11.html`
- Source: `vendor:anthropic:2026-05-11:https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview`
- Source: `vendor:openrouter:2026-05-11:https://openrouter.ai/docs/api-reference/chat-completion`
- Source: `vendor:openrouter:2026-05-13:https://openrouter.ai/docs/api-reference/streaming`

## Canonical Repository Shape

- `apps/web`
  - Next App Router application
  - route handlers under `src/app/api/v1/**/route.ts`
  - server-only orchestration, auth, adapter, and HTTP modules under
    `src/server/**`
  - client components and design-system code under `src/components/**`
  - design tokens in `src/app/theme.css`; scholarly workbench primitives in
    `components.css`, proceedings/verdict classes in `inspector.css`, archive
    and recovery-ledger classes in `archive.css`, Provider Record diagnostic
    ledger classes in `diagnostics.css`, and gate/editor folio classes in
    `surface.css`, all imported from `globals.css`
  - inspector splits into `components/inspector/council-track.tsx`,
    `components/inspector/verdict-card.tsx`, and
    `components/sessions/session-inspector.tsx` (orchestrator)
  - phase-3 chip protocol parsed by `lib/chips.ts` (remark plugin) and
    rendered by `verdict-card.tsx`; member-position sigils live in
    `components/app/sigil.tsx`
- `apps/cli`
  - HTTP-only batch client against `/api/v1`
- `packages/contracts`
  - shared Zod schemas, `/api/v1` route registry, envelope builders, typed
    error-detail constructors, request/response contracts, and domain enums
- `packages/config`
  - environment profiles, prompt defaults, output formats, built-in councils,
    limits, and runtime constants
- `packages/db`
  - Drizzle schema, hand-owned squashed init SQL, queries, transactions, and
    test database helpers

No runtime code remains in `client/`, `server/`, or `shared/`.

## Scholarly Council UI Contract

The web product is a serious medieval/scholarly council workbench: a docket
desk, seven-seat proceedings view, verdict article, provider call ledger, and
session archive. The visual register is institutional and archival, not generic
SaaS and not fantasy game ornament.

`apps/web/src/app/theme.css` is the only raw token owner for rendered CSS
colors, fonts, radii, shadows, and motion. Screens consume primitives and
semantic classes; they do not introduce ad hoc colors, full-pill controls,
glows, or novelty typography. Browser chrome metadata in `layout.tsx` uses a
named theme constant that mirrors the ink background. The design system uses
dark ink, archive green, muted brass, parchment-tinted surfaces, hairline rules,
small radii, and quiet focus rings.

Typography is hierarchical:

- the medieval/display face is reserved for the wordmark, seat letters, selected
  title plates, and verdict drop-caps;
- body copy, controls, labels, nav, badges, forms, and tables use the readable
  body face;
- provider model IDs, route evidence, costs, tokens, and diagnostics use the
  mono face.

The type system is launch-owned. `layout.tsx` imports `next/font/local` and
bundled OFL font files under `apps/web/src/app/fonts`; rendered proof and
production builds do not depend on Google Fonts network fetches. The local font
loader contract comes from Next's local-font API
(`vendor:Next.js:16.2.1:https://nextjs.org/docs/app/getting-started/fonts` and
`node_modules:node_modules/.pnpm/next@16.2.1_@playwright+test@1.59.1_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/compiled/@next/font/dist/local/index.d.ts:1`).
Bundled source faces are Google Fonts OFL assets:
MedievalSharp
(`vendor:Google Fonts:2026-05-15:https://raw.githubusercontent.com/google/fonts/main/ofl/medievalsharp/MedievalSharp.ttf`),
Source Serif 4 normal/italic
(`vendor:Google Fonts:2026-05-15:https://raw.githubusercontent.com/google/fonts/main/ofl/sourceserif4/SourceSerif4%5Bopsz%2Cwght%5D.ttf`),
(`vendor:Google Fonts:2026-05-15:https://raw.githubusercontent.com/google/fonts/main/ofl/sourceserif4/SourceSerif4-Italic%5Bopsz%2Cwght%5D.ttf`),
and Victor Mono
(`vendor:Google Fonts:2026-05-15:https://raw.githubusercontent.com/google/fonts/main/ofl/victormono/VictorMono%5Bwght%5D.ttf`).

The route information architecture is:

- `/` is the Petition Desk and active Run Workbench. The authenticated composer
  files a `Matter`, chooses a `Council`, attaches `Evidence`, and submits for
  `Deliberation` through real form submissions. Council, rerun-council, archive
  filter, and tuning choices are native radio semantics where the user is making
  one exclusive choice. Evidence uses a product-owned exhibit picker with
  keyboard file selection, drag/drop, a selected-exhibit ledger, per-exhibit
  removal, and clear-all recovery. After submit, the run status, proceedings,
  verdict, and record are primary; the composer becomes an explicit `File another
  matter` surface with the submitted draft cleared unless the user chooses to
  reuse it. The locked gate presents a stored BYOK unlock as the primary path
  when this browser already holds an encrypted key; otherwise the demo magic-link
  request is primary and only syntactically valid email addresses can be
  submitted. Demo seals expire in the client at their server-issued expiry time
  and are rechecked when the tab becomes visible. BYOK admission selects
  Founding before the paid-key session starts, so a user who brings their own
  key starts on the flagship roster unless they deliberately choose a lower-cost
  council.
- `/councils` is the Council Library and editor. BYOK users duplicate templates,
  inspect and edit seven member seats first, and then edit phase contracts.
  Model selection uses a product-owned catalog suggestion ledger: readable model
  names are primary, exact provider IDs stay muted evidence, and current catalog
  validation gates editable seats. Tuning controls render only when the selected
  model advertises the matching OpenRouter parameter; unsupported saved tuning is
  pruned at edit time before the council can be saved. Demo users see a locked
  Commons-only explanation.
- `/sessions` is the Archive. It is a dense ledger for search, filters,
  selection, export, recovery inspection, and detail inspection. Archive loading
  starts ledger-first and does not auto-open an arbitrary manuscript; a row
  click, deep link, or explicit restored selection opens the manuscript. Archive
  row actions select the run; cost-bearing Continue and Rerun actions execute
  from the detail panel after the original matter, council, preserved artifacts,
  and reused work are visible. Desktop keeps the archive ledger beside the
  selected manuscript. Mobile renders an opened manuscript before the archive
  ledger so a requested verdict, recovery record, or Provider Record is the
  first visible surface instead of being buried below the docket list.
- `/sessions/[sessionId]` is the deep-linked Manuscript for one run.

The council track renders seven typed seats from run snapshot and artifact
state. Each seat shows seat letter, role, concise model label, exact full model
ID as visible muted evidence, phase/ranking state, and split/synthesis state.
Failed runs never claim missing work is still `deliberating`; absent artifacts
render as `not reached`, and preserved draft-only work renders as preserved
evidence.
The track reports reviewer ranking signals, not consensus or a vote winner.
Review-signal copy is grammatical for no rankings, one ranking, unanimous
rankings, and split rankings, including singular split leaders. Verdict copy
states that Synthesizer G resolves by correctness and cited evidence rather than
majority ranking.

The verdict renders as an analytical article with semantic headings for the
docketed matter, verdict, and recovery record. The submitted query is a docket
entry, not a pull quote. Proceedings, Provider Record, and Export Dossier are
separate control surfaces with distinct visual registers for status seals,
metadata, and diagnostics. Verdict chips use one canonical evidence map:
candidate chips open Proceedings before scrolling to the matching phase-1
draft with the council seat as fallback; reviewer chips open Proceedings before
scrolling to the matching phase-2 critique with a phase-1 draft fallback.
Proceedings render the full phase-2 critique payload: scores, strengths,
weaknesses, critical errors, missing evidence, verdict input, major
disagreements, and final-answer inputs.
Each route owns one page-level heading even when the visual surface starts with a
workbench card. Provider Record rows use the same seat vocabulary as
Proceedings: seat sigil, seat alias, and role are primary; raw integer member
positions are only evidence.
The Provider Record control loads the receipt and moves focus of attention to
that ledger instead of changing a button label offscreen. Provider Record begins
with a run-level summary separating accepted provider outputs from failed,
denied, or unsettled billing attempts, so a completed verdict can coexist with
issue rows without implying that failed calls contributed evidence or that
pending billing is final cost evidence.
Failed-run recovery copy maps internal failure enums to product language, names
the redacted terminal job error when one exists, names the original council for
Continue, and names a freshly chosen council for Prepare Rerun, because only the
final Run Again submit starts a new cost-bearing deliberation.
Arbitrary markdown output is contained: ordinary prose, links, inline code, and
table cells wrap inside the manuscript; tables and code blocks keep horizontal
scroll when that preserves meaning.
Rendered Provider Record fixtures use runtime-real rows: phase-1 success,
phase-2 structured success, pre-egress capability denial, and upstream
transport failure stay separate so proof never validates an impossible provider
call state.

UI proof requires rendered desktop, tablet, and mobile evidence for the locked
gate, demo receipt, demo composer, BYOK composer, submitted workbench, archive,
processing run, completed verdict, Provider Record, failed recovery, and
seat-first council editor. Mobile detail states also require focused viewport
captures for the demo receipt, submitted workbench, processing run, completed
verdict, Provider Record, and failed recovery so long surfaces are proven both
as complete pages and usable first viewports. The regenerated contact sheet is
the review index for the current proof set. Screenshot capture hides only the
unfocused fixed skip link so full-page images do not paint offscreen
accessibility chrome over scrolled content; focused skip-link behavior remains
covered by browser acceptance proof.
Functional e2e proof alone is not sufficient for this surface.

## Runtime Stack

- Web/runtime: Next App Router on Node runtime
- UI: React 19, Tailwind v4, shadcn/ui, Radix only where actually rendered
- Client state: native `fetch` plus local React state; browser-owned BYOK auth
  and drafts stay client-side. Demo identity is cookie-owned server state.
- Validation: Zod from `packages/contracts`
- Database: PostgreSQL via `pg` and Drizzle
- Formatting/linting/import organization: Biome only
- External providers: one adapter per provider boundary

### Runtime Decision Basis

- Next App Router is the canonical router/build/runtime for server and client
  composition, route handlers, and server/client component boundaries.
  - Source: `vendor:next:16.2.1:https://nextjs.org/docs/app/getting-started/server-and-client-components`
  - Source: `vendor:next:16.2.1:https://nextjs.org/docs/app/getting-started/route-handlers`
- Worker startup hooks are owned through Next instrumentation on the Node
  runtime.
  - Source: `vendor:next:16.2.1:https://nextjs.org/docs/app/guides/instrumentation`
- Node exposes built-in dotenv loading through `process.loadEnvFile`, which
  keeps local env loading dependency-free.
  - Source: `vendor:node:26:https://nodejs.org/api/process.html#processloadenvfilepath`
- Docker Compose service health checks and named-volume lifecycle support one
  canonical local Postgres substrate and deterministic reset flow.
  - Source: `vendor:docker:compose:https://docs.docker.com/reference/compose-file/services/#healthcheck`
  - Source: `vendor:docker:compose:https://docs.docker.com/reference/cli/docker/compose/down/`
- Playwright supports an explicit `webServer.url`, per-server environment, and
  `baseURL`; The Seven uses explicit projection for self-started browser proof
  and uses external-server mode only when `pnpm local:live` already owns app
  startup.
  - Source: `vendor:playwright:1.59.1:https://playwright.dev/docs/test-webserver`
- NextResponse redirect responses take an explicit URL, and NextRequest
  `nextUrl` is the parsed current request URL. Redirect contracts that must
  land on the public browser origin use the config-owned public origin rather
  than a proxy- or adapter-materialized request URL.
  - Source: `vendor:next:16.2.1:https://nextjs.org/docs/app/api-reference/functions/next-response`
  - Source: `vendor:next:16.2.1:https://nextjs.org/docs/app/api-reference/functions/next-request`
- Installed Next normalizes loopback request hostnames in `NextURL`, so local
  same-origin admission treats HTTP `localhost`, `127.0.0.1`, and `::1` as the
  same authority only when their ports match.
  - Source: `node_modules:node_modules/.pnpm/next@16.2.1_@playwright+test@1.59.1_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/server/web/next-url.js:15`
  - Source: `node_modules:node_modules/.pnpm/next@16.2.1_@playwright+test@1.59.1_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/server/web/next-url.js:133`
- Fetch Metadata defines `Sec-Fetch-Site` as the request initiator/target
  relationship with `same-origin`, `same-site`, `cross-site`, and `none`
  values. The `Sec-` prefix makes these headers browser-owned rather than
  JavaScript-forgeable.
  - Source: `vendor:w3c:2025-04-01:https://www.w3.org/TR/fetch-metadata/#sec-fetch-site-header`
- Resend documents that inbound email webhooks carry metadata and require the
  Received Emails API for body retrieval. It also documents list and retrieve
  endpoints for received emails and states that inbound emails are stored even
  when no webhook is configured or a webhook endpoint is unavailable. `pnpm
  local:live` therefore polls the Receiving API for the just-requested demo
  email and retrieves the body from the provider-owned mailbox instead of
  creating a temporary local webhook tunnel.
  - Source: `vendor:resend:2026-05-10:https://resend.com/docs/api-reference/emails/list-received-emails`
  - Source: `vendor:resend:2026-05-10:https://resend.com/docs/api-reference/emails/retrieve-received-email`
  - Source: `vendor:resend:2026-05-09:https://resend.com/docs/webhooks/emails/received`
  - Source: `vendor:resend:2026-05-10:https://resend.com/blog/inbound-emails`

## HTTP Contract Registry

All machine-facing routes live under `/api/v1`.

`packages/contracts/src/http/registry.ts` owns the public registry types,
lookup helper, and path builder. `packages/contracts/src/http/registryRoutes.ts`
owns the route row data. Each row declares:

- method,
- path pattern,
- resource name,
- auth policy,
- path params schema,
- query schema,
- request body schema,
- success payload schema,
- response mode (`json` or `redirect`),
- denial rows.

Web route files adapt registry rows to `NextResponse`; they do not define public
resource names, envelope shapes, or body contracts. Success and error envelopes
are built by `packages/contracts` and emitted by the web adapter.

Route input parsing is single-pass. The web adapter parses path params, query,
and body once through the registry schemas, then passes the transformed outputs
to handlers. Handlers never re-parse transformed path params such as council
`locator`.

Adapter-emitted denials are explicit registry rows. Oversized bodies and invalid
ingress headers are possible on every route and emit `kind=invalid_input` with
`details.reason=body_too_large` and `details.reason=invalid_ingress`. Routes
with a JSON request body also declare JSON syntax and non-JSON media denials as
`kind=invalid_input` with `details.reason=invalid_json` and
`details.reason=invalid_content_type`. No-body routes reject any request bytes as
`details.reason=invalid_request`; they do not advertise impossible JSON-parser
denials.
Cookie-auth mutating requests emit `kind=forbidden` with
`details.reason=same_origin_required`, and demo consume host admission emits
`kind=forbidden` with `details.reason=public_origin_required`.

### API Routes

- `POST /api/v1/auth/validate`
- `POST /api/v1/demo/request`
- `GET /api/v1/demo/consume`
- `GET /api/v1/demo/session`
- `POST /api/v1/demo/logout`
- `GET /api/v1/councils`
- `GET /api/v1/councils/[locator]`
- `POST /api/v1/councils/duplicate`
- `PUT /api/v1/councils/[locator]`
- `DELETE /api/v1/councils/[locator]`
- `GET /api/v1/councils/output-formats`
- `POST /api/v1/models/validate`
- `POST /api/v1/models/autocomplete`
- `POST /api/v1/sessions`
- `GET /api/v1/sessions`
- `GET /api/v1/sessions/[sessionId]`
- `POST /api/v1/sessions/[sessionId]/continue`
- `POST /api/v1/sessions/[sessionId]/rerun`
- `GET /api/v1/sessions/[sessionId]/diagnostics`
- `POST /api/v1/sessions/export`

No second API surface exists. No tRPC surface exists. No framework-internal
mutation path replaces these public contracts.

Route registry schemas are closed at public ingress. Extra request body keys,
noncanonical council locators such as `user:7junk` or `user:07`, and non-empty
bodies on no-body routes are denied as `invalid_input` instead of being stripped
or normalized into another accepted shape.

### HTTP Envelope Contract

Every JSON edge emits one success or one error envelope. JSON API responses set
`Cache-Control: no-store` because auth, session, diagnostics, and workflow state
are browser authority surfaces rather than cacheable documents.

Success:

```json
{
  "schema_version": 1,
  "trace_id": "uuid",
  "ts": "RFC3339",
  "result": {
    "resource": "string",
    "payload": {}
  }
}
```

Error:

```json
{
  "schema_version": 1,
  "kind": "string",
  "message": "string",
  "details": {},
  "trace_id": "uuid",
  "ts": "RFC3339"
}
```

Canonical error kinds:

- `invalid_input`
- `unauthorized`
- `forbidden`
- `not_found`
- `rate_limited`
- `upstream_error`
- `internal_error`

Reserved envelope fields are `schema_version`, `trace_id`, `ts`, `result`,
`resource`, `payload`, `kind`, `message`, and `details`.

## Auth, Authority, and Ingress

- BYOK principal = `sha256_hex(openrouter_api_key)`, but the principal is not
  materialized until OpenRouter validates the key.
- Demo principal = normalized email address.
- Browser BYOK requests send `Authorization: Bearer <openrouter_api_key>` to
  `/api/v1`.
- Browser demo requests send no demo authorization header. The server reads one
  `HttpOnly; SameSite=Lax; Secure-in-production` cookie created by
  `GET /api/v1/demo/consume`.
- Cookie-auth mutating routes enforce same-origin request checks before handler
  execution. BYOK routes remain header-based and do not use cookie authority.
- Demo mode may read sessions and submit runs, but only with the Commons
  Council.
- Demo mode cannot duplicate, update, or delete councils.

Request admission is split into two process edges:

1. Metadata admission creates a server-owned trace ID, parses
   `X-Seven-Ingress`, bounds client metadata, and resolves IP only from direct
   request state. Spoofable proxy client-IP headers are ignored.
2. Auth admission validates BYOK keys upstream before user creation and
   validates demo cookies against the demo-session table.

Ingress flood rate limiting runs between metadata admission and auth admission,
before demo-session lookup, BYOK user creation, or any other authenticated DB
mutation. Invalid `X-Seven-Ingress`, multiline ingress version, and oversized
ingress version deny as `invalid_input`; they never fall back to `web`.

Server trace IDs are canonical audit truth. Client trace/request IDs are
optional bounded metadata only.

Cookie-auth mutating routes accept same-origin browser requests when `Origin` or
`Referer` matches `SEVEN_PUBLIC_ORIGIN`. When explicit origin evidence is
present and does not match, the request is rejected even if Fetch Metadata says
`same-origin`. Browser-owned Fetch Metadata `Sec-Fetch-Site: same-origin` is
accepted only when explicit `Origin` and `Referer` evidence is absent.
`same-site`, `cross-site`, malformed, contradictory, and missing same-origin
evidence are rejected with `same_origin_required`.
Non-production local proof also admits the current request origin so
`SEVEN_BASE_URL` can target loopback while `SEVEN_PUBLIC_ORIGIN` remains the
public browser authority. `localhost` and `127.0.0.1` are equivalent only for
non-production HTTP loopback origins on the same port; this keeps browser
requests valid across local loopback aliases without admitting cross-origin
cookies. Production admits only the configured public origin or uncontradicted
browser-owned `same-origin` fetch metadata and never treats request-derived
`Host` as public-origin authority.

## Demo Auth

`POST /api/v1/demo/request` accepts an email address, applies rate limits before
user or magic-link creation, creates a one-time magic-link token, and sends an
email through Resend. `SEVEN_PUBLIC_ORIGIN` is the canonical origin for the
email link and must be the public browser origin for the deployed service.

The email link targets:

```text
<SEVEN_PUBLIC_ORIGIN>/api/v1/demo/consume?token=<one-time-token>
```

`GET /api/v1/demo/consume` first admits only requests whose strict `Host`
authority maps to `SEVEN_PUBLIC_ORIGIN`; userinfo, paths, query strings,
fragments, whitespace, and control characters fail closed instead of
normalizing into an accepted host. Local development uses the local HTTP
materializer to project a matching loopback `SEVEN_PUBLIC_ORIGIN` when the
configured public origin is absent or loopback; live proof targets loopback
transport while sending the public `Host` header. Wrong-host or malformed-host
requests return the typed `public_origin_required` denial before rate-limit
mutation or token consumption. Admitted API requests validate the
token, mark it used, create a demo session, set the demo cookie, and return a
`303` redirect to `<SEVEN_PUBLIC_ORIGIN>/`. Missing, blank, whitespace-only,
reused, expired, or invalid tokens for API ingress return the typed denial
envelope. Browser ingress for missing, blank, whitespace-only, reused, expired,
invalid, or disabled demo links returns a `303`
redirect to `<SEVEN_PUBLIC_ORIGIN>/?demo_link=<state>`, where the home screen
renders the recovery state and lets the user request a fresh link. Browser
localStorage never stores a demo token.

`GET /api/v1/demo/session` returns the active non-revoked cookie session
metadata for UI bootstrap. `POST /api/v1/demo/logout` revokes the active demo
session row before the adapter clears the cookie; a UI logout is not considered
complete until the server acknowledges that authority change. A stale cookie for
a revoked row resolves as `invalid_token`.

## Provider Capability

OpenRouter is the only provider boundary. Its public model catalog exposes model
identifiers, context length, pricing, and `supported_parameters`; every provider
call snapshots the catalog row before execution and denies unsupported non-null
tuning before contacting the provider.
OpenRouter HTTP calls are bounded by a fifteen-minute request timeout that
covers connection, headers, response-body consumption, and JSON parse. That
budget is long enough for observed top-tier xhigh synthesis calls with compact
phase-3 material and still finite for stuck provider bodies. Transport failures
and body timeouts map to typed upstream diagnostics instead of hanging a job
indefinitely.
Retryable OpenRouter choice-level failures such as upstream `5xx` errors retry
inside the adapter before the workflow records a terminal provider-call result.
When the final retry attempt still returns a structured choice error, the typed
adapter error carries that final provider response so the workflow persists the
generation ID, response model, choice error code/message, upstream status/code,
and billing lookup state in the same provider-call row.
Streaming chat responses must declare `text/event-stream`; a successful-status
non-streaming body is treated as a retryable upstream transport mismatch instead
of being parsed as a partial chat completion. OpenRouter automatically includes
usage in the final streaming chunk, so the app does not send deprecated
`stream_options.include_usage` or `usage.include` request knobs. Streaming chunks
are allowed to omit `model` when the response still has a generation ID and
assistant content; in that observed case provider diagnostics use the exact
requested model ID as the response-model fallback. A missing generation ID still
denies the response because billing lookup and release provenance need a stable
provider generation handle.

- Source: `vendor:openrouter:2026-05-13:https://openrouter.ai/docs/api/api-reference/models/get-models`
- Source: `vendor:openrouter:2026-05-13:https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request`
- Source: `vendor:openrouter:2026-05-13:https://openrouter.ai/docs/api-reference/streaming`
- Source: `vendor:openrouter:2026-05-14:https://openrouter.ai/docs/guides/administration/usage-accounting`
- Source: `vendor:openrouter:2026-05-13:https://openrouter.ai/docs/guides/routing/provider-selection`
- Source: `vendor:openrouter:2026-05-13:https://openrouter.ai/docs/guides/features/structured-outputs`
- Source: `vendor:openrouter:2026-05-16:https://openrouter.ai/docs/guides/best-practices/reasoning-tokens`
- Source: `vendor:openrouter:2026-05-16:https://openrouter.ai/docs/api/reference/parameters`
- Source: `vendor:openrouter:2026-05-16:https://openrouter.ai/api/v1/models?output_modalities=text`
- Source: `vendor:MDN Fetch API:2025-09-17:https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#canceling_a_request`

Fresh catalog probes on 2026-05-13, 2026-05-14, and 2026-05-16 returned status
200 and current text model rows from `/api/v1/models`; the 2026-05-16 probe is
the active roster fixture source. The OpenRouter models documentation defines
`supported_parameters`, pricing, context, maximum completion token, and
expiration metadata as model-row fields, and the chat-completion documentation
defines `max_tokens`, `response_format`, `provider.require_parameters`,
`provider.ignore`, and `reasoning` as request-time inputs. OpenRouter now labels `max_tokens` as
deprecated in favor of `max_completion_tokens`, but current catalog rows still
advertise `max_tokens` in `supported_parameters`; The Seven therefore uses the
catalog-declared parameter and sends `provider.require_parameters=true` so the
request is not routed to endpoints that drop it. The workflow also sends
`provider.ignore=["amazon-bedrock","azure"]` because those endpoint families
failed or blocked exact structured-output probes. Catalog support is necessary
but not sufficient for The Seven's built-ins: each phase-2 reviewer model must
also pass the app's exact structured-output request with the current compact provider-facing phase-2 JSON schema, and each synthesizer must pass the app's compact phase-3
synthesis-material request. The 2026-05-12 through 2026-05-14 probes proved that
several catalog rows advertising structured output still fail this app's strict
schema, so probe-backed execution owns launch selection.
Built-in tier effort is app-owned and materialized as requested OpenRouter
`reasoning.effort`: Commons sends `low`, Lantern sends `medium`, and Founding
sends `xhigh`. OpenRouter documents `reasoning.effort` as a unified abstraction
that maps across providers, so provider diagnostics prove the requested and sent
value, not every upstream model's private realized thinking budget. Built-in defaults do not tailor
temperature, top-p, seed, verbosity, or reasoning-return flags per model. Runtime
capability checks still deny any unsupported non-null tuning before provider
execution. Custom council tuning is also value-bounded before provider egress:
`reasoning.effort` may only be `none`, `minimal`, `low`, `medium`, `high`, or
`xhigh`; `verbosity` may only be `low`, `medium`, `high`, `xhigh`, or `max`.
These enums are contract-owned so HTTP writes, UI controls, built-ins, session
snapshots, and provider request materialization cannot drift into ad hoc string
values.

The server caps provider output at 8192 tokens for phase 1 and 16384 tokens for
phases 2 and 3. A catalog row that cannot accept the phase-owned cap is denied
before provider execution instead of silently lowering the request. Phase 1
answers stay bounded for prompt fan-in. Phase 2 needs the larger finite cap for
strict structured review output, and it uses the OpenRouter streaming transport
because OpenRouter documents streaming as the supported long-running completion
path with keepalive comments and structured-output streaming. Phase 3 receives
the six candidate answers plus compact reviewer summaries: each reviewer
contributes its ranking, final-answer input bullets, major disagreements, and
per-candidate score plus `verdict_input`. The synthesizer does not receive the
full six-by-six review object with `strengths`, `weaknesses`,
`critical_errors`, and `missing_evidence`; those remain persisted phase-2
diagnostics. Phase 2 still persists only bounded review strings: `strengths`
and `weaknesses` are required non-empty per-candidate lists, while
`critical_errors`, `missing_evidence`, and `major_disagreements` may be empty
when no material item exists. Regular list entries, `best_final_answer_inputs`,
and `major_disagreements` require material prose
with at least 12 characters and at least two distinct words and are each capped
at 1200 characters. `verdict_input` uses the same material-prose rule and is
capped at 2000 characters. Per-candidate review lists are capped at 5 items, and
phase-level summary lists are capped at 8 items.

The built-in roster policy is positive and tier-owned:

- Founding is the BYOK flagship. It uses the best current OpenRouter-accessible
  model IDs available for broad reasoning. Price is not a selection constraint.
  The final-answer policy seat is the synthesizer because phase 3 produces the
  final answer with the other artifacts as reference material, not a mechanical
  summary. Direct benchmark scores prove the policy when the exact model row is
  scored; when benchmark rows lag a product-tier model such as GPT-5.5 Pro, the
  docs name the evidence gap instead of claiming a scored ranking. The seven
  slots are distinct; provider diversity is a tie-breaker only and never
  justifies omitting a stronger current model.
- Lantern is the deliberate mid-tier bridge. It uses strong current models that
  sit below the flagship set while preserving distinct model IDs and useful
  provider breadth. Its synthesizer is the final-answer policy seat, and it
	  sends medium requested reasoning effort by default.
- Commons is the demo council. It is paid, cheap, reliable, and good enough to
  sell the product; it is not a free-model showcase and it does not use `:free`,
	  `~latest`, or preview model aliases. Commons sends low requested reasoning effort by
  default because the product already runs multi-phase deliberation; xhigh
  per-member demo calls multiply latency and cost without being the demo
  contract. Commons uses nonzero-priced rows from the paid-cheap
  high-intelligence cluster and keeps the current 3:1 input/output blended row
  ceiling anchored by GPT-5 Mini.

Current built-in rosters:

| Tier | Member 1 | Member 2 | Member 3 | Member 4 | Member 5 | Member 6 | Synthesizer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Founding | `openai/gpt-5.5` | `anthropic/claude-opus-4.7` | `google/gemini-3.1-pro-preview` | `moonshotai/kimi-k2.6` | `xiaomi/mimo-v2.5-pro` | `x-ai/grok-4.3` | `openai/gpt-5.5-pro` |
| Lantern | `anthropic/claude-sonnet-4.6` | `deepseek/deepseek-v4-pro` | `z-ai/glm-5.1` | `qwen/qwen3.6-plus` | `google/gemini-3-flash-preview` | `mistralai/mistral-medium-3-5` | `qwen/qwen3.6-max-preview` |
| Commons | `qwen/qwen3.6-35b-a3b` | `google/gemini-3.1-flash-lite` | `openai/gpt-5-mini` | `deepseek/deepseek-v4-flash` | `openai/gpt-5-nano` | `mistralai/mistral-small-2603` | `minimax/minimax-m2.7` |

The 2026-05-16 catalog rows for these IDs expose text output, nonzero prompt and
completion pricing, no expiration date, current context windows, maximum
completion token metadata when OpenRouter publishes it, and model-specific
`supported_parameters`. The 21 built-in model IDs are distinct across the three
tier clusters. Commons live execution uses the app-compatible low-effort tuning
shape, Lantern uses medium requested effort, and Founding uses xhigh requested effort for the
flagship council. Built-in defaults therefore send only `reasoning.effort`;
the phase-owned `max_tokens` and phase-2 `response_format` are materialized by
the workflow, not by the council template.

The roster ranking basis is current raw intelligence first, OpenRouter
feasibility second, and price only where the tier defines it. Artificial
Analysis and the 2026-05-13 intelligence/cost image place the selected model
families in the relevant current frontier, bridge, and cheap-intelligence
clusters. OpenRouter confirms the exact transport IDs, pricing, no catalog
expiration date, and supported parameter rows for the surviving built-ins.
LMArena is a secondary cross-check for top-tier relative strength when current
benchmark rows lag exact product names. The current benchmark citation scores
GPT-5.5 directly and does not publish the same scored metric row for GPT-5.5
Pro; GPT-5.5 Pro remains the Founding final-answer policy seat and must be
proven by live completion before release rather than represented as a
benchmark-proven rank.

- Source: `vendor:openrouter:2026-05-16:https://openrouter.ai/api/v1/models?output_modalities=text`
- Source: `vendor:artificial-analysis:2026-05-13:https://artificialanalysis.ai/leaderboards/models`
- Source: `vendor:artificial-analysis:2026-05-13:https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index`
- Source: `vendor:lmarena:2026-05-13:https://lmarena.ai/leaderboard`

The structured-output probe remains part of the launch contract. Catalog support
alone does not make a built-in launchable: every reviewer must validate through
live model validation and complete the app's phase-2 structured-output request
inside `pnpm local:live`; every synthesizer must complete compact phase-3
synthesis; and the full live proof must produce completed BYOK sessions for
Commons, Lantern, and Founding plus the demo Commons flow. Rows that fail the
exact schema, return malformed JSON, time out, refuse, emit empty content, hit
provider instability, or exhaust account credits block release until replaced or
the provider condition is resolved. Commons member 1 is
`qwen/qwen3.6-35b-a3b`, not `qwen/qwen3.6-flash`, because the current OpenRouter
row is cheaper on both prompt and completion pricing, exposes the required
reasoning, max-token, structured-output, and response-format parameters, has a
larger published output cap, and has current benchmark evidence in the
cheap-intelligence cluster. DeepSeek V4 Flash survives as another low-cost row
because it is cheaper than GPT-5 Mini, current in the OpenRouter catalog,
supports the required request parameters, and sits higher than lower-cost
fallback rows in the current Artificial Analysis intelligence/cost view.
`qwen/qwen3.6-27b` remains inactive because it exceeds the Commons GPT-5 Mini
blended row ceiling. The initially considered `x-ai/grok-4.1-fast` row is also
inactive because it is not present in the current OpenRouter `/api/v1/models`
active catalog, so the workflow denies it before provider execution.

Retired built-in IDs are not aliases. `openai/gpt-5.4-mini`,
`openai/gpt-5.4-nano`, `x-ai/grok-4.20`, `x-ai/grok-4.20-multi-agent`,
`deepseek/deepseek-v3.2`, `google/gemini-2.5-flash`,
`qwen/qwen3.5-35b-a3b`, `openai/gpt-oss-120b`,
`arcee-ai/trinity-mini`, `x-ai/grok-4.1-fast`, `google/gemma-4-31b-it`,
`qwen/qwen3.6-27b`, `qwen/qwen3.6-flash`, and
`bytedance-seed/seed-2.0-lite` are no longer active built-ins. The surviving roster
table is the complete public built-in set.

API-key admission uses OpenRouter `/key` validation before a BYOK user row is
created. Invalid keys deny as `unauthorized`; provider transport failures deny
as public `502 upstream_error` while the upstream status stays in diagnostics.

- Source: `vendor:openrouter:2026-05-13:https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key`

Provider diagnostics persist requested model, catalog freshness, supported
params, sent params, denied params, requested output cap, sent reasoning-effort
value when a reasoning request is materialized, sent OpenRouter provider-routing
controls, upstream status/code, response model, generation ID, and billing lookup status. Billing lookup status is the
finite `not_requested | pending | succeeded | failed` contract in both the
database and public diagnostics. Generation billing lookup is diagnostic
only. A missing, failed, or abandoned lookup marks the provider-call diagnostic
row as pending or failed; it does not rewrite the execution result. Startup
recovery retries terminalization for abandoned pending rows on terminal sessions
through a bounded supervisor lifecycle step so a transient database failure does
not leave restart-owned billing diagnostics pending. Pending diagnostics on
nonterminal or reclaimable work are left untouched.
Session detail and diagnostics payloads expose the redacted terminal job error
as `terminalError` so local and live proof surfaces name parser/provider
blockers without exposing credentials.

- Source: `vendor:openrouter:2026-05-13:https://openrouter.ai/docs/api/api-reference/generations/get-generation`

Built-in council tuning is explicit per tier. Unsupported defaults are `null`:
templates send only the tier's `reasoning.effort`, while phase-owned output caps
and structured-output requests are added by the workflow. Unsupported non-null
user tuning, missing `max_tokens` support, expired catalog rows, and required
phase-2 structured-output gaps are denied before provider execution with typed
diagnostics.

## Orchestration and Persistence

- Submit creates one immutable `sessions` row plus one queued `jobs` row in a
  transaction.
- `jobs` rows are claimed with `FOR UPDATE SKIP LOCKED`.
- Leases expire and are reclaimable until the configured `JOB_MAX_ATTEMPTS`
  ceiling is reached. An expired leased job at the ceiling terminalizes the job
  and session as `internal_error`, clears the credential, and is not reclaimed
  again.
- Lease renewal failure aborts the claimed orchestration signal. Processing
  transitions, provider egress, and artifact or diagnostic writes verify the
  same active `(job, session, lease_owner)` claim before side effects, so a
  lost-lease worker cannot keep writing into a session after the row becomes
  reclaimable.
- If orchestration unexpectedly throws outside the typed claimed-terminal path,
  the supervisor leaves the leased credentialed job reclaimable instead of
  applying a job-only terminal fallback that could strand the session in
  `processing`.
- Continue is allowed only for failed sessions and requeues the same session in
  one transaction; credential materialization failure cannot clear the failed
  state without a runnable replacement job.
- Rerun is allowed only for terminal sessions and creates a new session. Blank
  edited matter is not sent as a schema-failing override; the client either
  reuses the original matter or blocks with docket guidance before any
  cost-bearing request.
- Completed sessions are idempotent.
- Claimed terminal transitions bind `jobs.id`, `jobs.session_id`, `jobs.state`,
  `jobs.lease_owner`, and an unexpired `jobs.lease_expires_at` before updating
  the session terminal state.
- Provider artifacts are inserted idempotently by `(session_id, artifact_kind,
  member_position)`.
- Short-lived worker credentials are envelope-encrypted with HKDF-derived
  AES-GCM keys. The envelope carries version and key ID, and the AAD binds the
  credential to user/session/job identity.

The database is pre-release greenfield. Schema changes update
`packages/db/src/schema.ts` and `packages/db/drizzle/0000_init.sql` together;
there are no migration compatibility layers. Local operator commands treat a
blank compose-managed database as valid because Node boot applies the squashed
init SQL. A compose database with existing The Seven tables must match the
current squashed schema; otherwise `pnpm local:db:up` fails closed and the
operator resets the local volume with `pnpm local:db:reset`.

## Payload Bounds and Redaction

- JSON request parsing requires `application/json` and reads the body through a
  byte-accurate bounded stream before parsing.
- Attachments have one policy: maximum count, filename length, decoded-byte
  length, extracted-char length, MIME/extension allowlist, parser timeout, and
  deterministic denial reasons.
- One redaction mapper runs before HTTP errors, provider-call diagnostics, logs,
  and UI diagnostic payloads. Secrets and bearer-like tokens are never emitted.
  Long non-secret identifiers remain visible; redaction is credential-pattern
  based rather than a broad long-string heuristic.

## Configuration Profiles

`packages/config` owns all environment requiredness:

- `serverRuntime`: Next server/runtime requirements.
- `cliRuntime`: CLI batch requirements.
- `operatorDoctor`: local workstation and minimal runnable development
  requirements.
- `liveProof`: live OpenRouter, Resend, demo sender, and demo test-inbox
  requirements.
- `playwrightProjection`: browser test projection from live/demo proof.

`SEVEN_PUBLIC_ORIGIN` is parsed by the config-owned `parsePublicOrigin` helper
as a bare HTTP(S) origin and is required by the server runtime rather than
defaulted. Paths, query strings, fragments, credentials, and non-HTTP schemes are
rejected instead of silently normalized. All local launch projection code
consumes that helper rather than owning a second public-origin parser. In
production it must be HTTPS and non-loopback. Live proof includes
`SEVEN_PUBLIC_ORIGIN` in its required key set because `SEVEN_BASE_URL` is only
the HTTP target for the proof harness, not the authority for user-visible links,
same-origin checks, OpenRouter referer headers, or post-consume redirects.

`pnpm dev`, `pnpm local:dev`, `pnpm local:live`, and full-gate browser proof do
not require port `3000`. `.env.local` is the local operator source of truth for
reserved runtime keys; ambient shell values cannot override those assignments,
and absent reserved keys stay absent rather than falling back to the shell.
`tools/local-http.ts` owns one local HTTP projection: it allocates one free
loopback port, projects `PORT=<port>` and
`SEVEN_BASE_URL=http://127.0.0.1:<port>` to child processes, and projects
`SEVEN_PUBLIC_ORIGIN=http://localhost:<port>` only when the configured public
origin is absent or loopback. `SEVEN_BASE_URL` is not a live credential and is
not fabricated by doctor; standalone CLI or live-test callers must receive it
from an explicit environment or from the launcher projection. `tools/local-dev.ts`,
`tools/next-dev.ts`, and `devtools/gate.py` consume that projection;
`devtools/gate.py` obtains it from the TypeScript materializer instead of
duplicating allocation rules. Explicit non-loopback public origins such as
`https://theseven.ai` are preserved for demo emails, OpenRouter referer headers,
same-origin checks, and live proof. The same launch context also projects
`SEVEN_NEXT_DIST_DIR=.next-local/<port>` for the internal Next development server,
so a browser proof can run while another
`apps/web` dev server owns `.next/dev/lock`. That projection is valid only for
Next's development-server phase; production build and start paths fail closed if
the variable leaks into them. Next's CLI defaults `next dev` to port `3000` from `PORT`, and
its dev server only retries ports when neither `--port` nor `PORT` supplied a
value
(`node_modules:node_modules/.pnpm/next@16.2.1_@playwright+test@1.59.1_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/bin/next:130`,
`node_modules:node_modules/.pnpm/next@16.2.1_@playwright+test@1.59.1_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/cli/next-dev.js:192`).
Next appends `/dev` to the configured `distDir` for development, then creates a
lock at `<distDir>/lock`; disabling that lock is explicitly not recommended
because concurrent writes can mangle the directory
(`node_modules:node_modules/.pnpm/next@16.2.1_@playwright+test@1.59.1_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/server/config.js:1090`,
`node_modules:node_modules/.pnpm/next@16.2.1_@playwright+test@1.59.1_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/server/lib/router-utils/setup-dev-bundler.js:142`,
`node_modules:node_modules/.pnpm/next@16.2.1_@playwright+test@1.59.1_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/server/config-shared.d.ts:811`).
Because Next rewrites `next-env.d.ts` from the effective `distDir`, the
local/proof launcher restores the canonical file after the dev process exits
(`node_modules:node_modules/.pnpm/next@16.2.1_@playwright+test@1.59.1_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/lib/typescript/writeAppTypeDeclarations.js:52`).
The gate runs `next typegen` before TypeScript checks so clean checkouts
materialize canonical `.next/types` without relying on ignored local cache
state; Next 16.2.1 exposes `typegen` as a first-class CLI command for route,
page, and layout definitions
(`node_modules:node_modules/.pnpm/next@16.2.1_@playwright+test@1.59.1_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/bin/next:101`).
The Next development indicator is disabled in `apps/web/next.config.ts` so
rendered proof captures product UI rather than framework debugging chrome; the
installed config contract accepts `devIndicators: false` for development
indicators
(`node_modules:apps/web/node_modules/next/dist/server/config-shared.d.ts:1006`).
Playwright waits on an explicit `url` or `port`, accepts per-server environment
projection, and recommends an explicit `baseURL` for relative navigation, so The
Seven projects `SEVEN_BASE_URL` instead of relying on a hidden default. Browser
proof self-starts do not reuse ambient servers; `SEVEN_PLAYWRIGHT_EXTERNAL_SERVER=1`
is the only path that intentionally attaches Playwright to an already-running
server
(`node_modules:node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/types/test.d.ts:943`,
`node_modules:node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/types/test.d.ts:10239`).
`pnpm local:live` additionally requires exclusive local job-worker ownership for
this repo. A stale same-repo `pnpm local:dev` or `next dev` process can claim DB
jobs with old code even when HTTP uses a separate free port, so the live harness
inspects the process table and fails closed before starting proof when such a
sibling worker is still running.

The installed Next `NextRequest` type exposes cookies, `nextUrl`, and `url`, but
no direct `ip` property, while the Node server materializes socket remote address
into `x-forwarded-for`
(`node_modules:node_modules/.pnpm/next@16.2.1_@playwright+test@1.59.1_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/server/web/spec-extension/request.d.ts:10`,
`node_modules:node_modules/.pnpm/next@16.2.1_@playwright+test@1.59.1_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/server/base-server.js:576`).
The Seven therefore treats direct runtime IP as optional and never reads
spoofable proxy IP headers. When the runtime does not expose direct IP, the
per-IP limiter branch is absent and global/email branches remain authoritative.

`pnpm local:doctor` proves local development readiness and does not require live
provider keys. `pnpm local:gate --full` is the canonical local full-gate alias;
it forwards gate flags to `uv run --python 3.12 devtools/gate.py` and removes
all reserved runtime/projection keys before the gate process so `.env.local`,
Next, Vitest, and Playwright own their build/test phases. `pnpm local:doctor
--live` is additive: it proves the same local development profile plus the
live-proof OpenRouter, Resend, sender, and inbox keys, without requiring or
inventing `SEVEN_BASE_URL`.
`pnpm local:live` runs the live doctor profile before
live work and refuses to proceed while another same-repo local dev worker can
claim jobs from the same database.

The Seven reads its local runtime profile from `.env.local`. The file can be
hand-authored from the examples, symlinked to a private secret-manager slice, or
materialized by any workstation-specific secret workflow that preserves the same
unprefixed variable names and private file mode. Tracked product docs do not
require a workstation-specific secret path.

`.env.local.example` is minimal runnable development with demo disabled and no
fixed local HTTP port. `.env.live.example` documents optional external/public
origin overrides rather than local transport defaults.
`.env.live.example` documents the live-proof overlay for BYOK, Resend, demo
sender, and demo test inbox.

Doctor fails when:

- `.env.local` is missing required development keys,
- the secret-slice target is broader than `0600`,
- `.env` contains any reserved runtime/proof key owned by `packages/config`,
- credential-looking values are obvious placeholders,
- Playwright Chromium is missing,
- `DATABASE_URL` does not target the compose-owned local Postgres authority on
  `127.0.0.1:5432` or `localhost:5432`,
- `DATABASE_URL` targets the canonical local port and that port is not free for,
  or owned by, `the-seven-postgres`,
- the healthy compose-managed database already contains The Seven tables that
  do not match the current squashed launch schema.

## Validation Bar

The final closeout sequence is:

```bash
pnpm local:doctor
pnpm local:db:up
pnpm run db:bootstrap:check
pnpm local:gate --full
```

When live keys are present, closeout additionally requires:

```bash
pnpm local:doctor --live
pnpm local:db:reset
pnpm local:live
```

`pnpm local:live` keeps repeatable local proof by deleting only the
proof-owned demo rate-limit buckets for `SEVEN_DEMO_TEST_EMAIL`, loopback IP
scopes, and the demo proof's global demo scopes before it requests a fresh
magic link. Product rate limits remain enforced in the route and covered by the
deterministic auth/security tests; the live harness cleanup does not change
runtime admission behavior. The live harness executes the capped demo Commons
session before the three heavy BYOK session proofs, because the local proof keys
can belong to the same OpenRouter account and the BYOK sequence can otherwise
self-induce provider 429s on the demo key. The live demo proof retrieves the
just-requested Resend email body and asserts that the absolute consume-link
origin equals the server runtime `SEVEN_PUBLIC_ORIGIN` before it follows the
link. It also asserts that the consume response redirects to
`<SEVEN_PUBLIC_ORIGIN>/`, so a proxy, adapter, or browser cannot silently land
the user on a localhost or internal origin after a correct email click.

When live keys are absent, `HANDOFF.md` records `[blocked]` with the exact
missing keys. When a live provider key is present but quota-limited,
`HANDOFF.md` records the provider quota blocker. Mocked provider success never
counts as launch proof.
