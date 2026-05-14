# The Seven

The Seven is a privacy-first multi-model council for hard questions. Six
reviewer models answer the prompt, each reviewer evaluates all six candidate
answers, and a seventh synthesizer produces one final verdict from the request,
candidates, and compact reviewer summaries. The whole run is preserved as a
durable record so the reasoning trail stays inspectable.

It is bring-your-own-key by default: the browser encrypts the reusable key
locally, the server sees plaintext only transiently per request, and durable
server state stores a hashed BYOK principal plus envelope-encrypted short-lived
worker credentials that are cleared when jobs reach terminal state. A paid
low-cost demo flow is available behind an email magic link.

- Three built-in councils: Founding (best-of-best with xhigh effective effort),
  Lantern (mid-tier bridge with medium effective effort), Commons (low-cost demo
  with low effective effort). All 21 built-in model ids are distinct across the
  three tiers.
- User-defined councils persist as one aggregate definition with shared phase
  prompts and exactly seven member slots.
- Default prompts are intentionally plain one-shot roles: phase 1 answers,
  phase 2 evaluates candidates, and phase 3 produces the final answer from the
  request, candidates, and compact reviewer summaries.
- Identity is canonicalized as `users(kind, principal)`: BYOK principals are
  hashed validated API keys and demo principals are normalized emails.

## Stack

- Next App Router
- React 19
- Tailwind v4 + shadcn/ui
- Zod
- PostgreSQL + Drizzle + `pg`
- Biome

## Workspace

- `apps/web` - product UI and `/api/v1`
- `apps/cli` - batch client against `/api/v1`
- `packages/contracts` - route registry, schemas, envelopes, and error details
- `packages/config` - env profiles, prompts, built-ins, limits
- `packages/db` - Drizzle schema and persistence

## Runtime Contract

- UI routes: `/`, `/councils`, `/sessions`, `/sessions/[sessionId]`
- API routes: `/api/v1/**`
- Built-ins:
  - Founding: current best-of-best BYOK roster with xhigh effective effort;
    the strongest tier model is the synthesizer, and provider diversity is a
    tie-breaker, not a substitute for stronger models
  - Lantern: deliberate mid-tier bridge roster with medium effective effort;
    the strongest tier model is the synthesizer
  - Commons: paid low-cost demo roster with low effective effort and no
    `:free`, `~latest`, or preview aliases; Commons also excludes OpenRouter rows with a catalog
    expiration date and stays at or below the current selected GPT-5 Mini
    blended row ceiling
  - all 21 built-in model IDs are distinct across the three tier clusters
- Current built-in roster:

| Tier | Member 1 | Member 2 | Member 3 | Member 4 | Member 5 | Member 6 | Synthesizer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Founding | `openai/gpt-5.5` | `anthropic/claude-opus-4.7` | `google/gemini-3.1-pro-preview` | `moonshotai/kimi-k2.6` | `xiaomi/mimo-v2.5-pro` | `x-ai/grok-4.3` | `openai/gpt-5.5-pro` |
| Lantern | `anthropic/claude-sonnet-4.6` | `deepseek/deepseek-v4-pro` | `z-ai/glm-5.1` | `qwen/qwen3.6-plus` | `google/gemini-3-flash-preview` | `mistralai/mistral-medium-3-5` | `qwen/qwen3.6-max-preview` |
| Commons | `qwen/qwen3.6-flash` | `google/gemini-3.1-flash-lite` | `openai/gpt-5-mini` | `deepseek/deepseek-v4-flash` | `openai/gpt-5-nano` | `mistralai/mistral-small-2603` | `minimax/minimax-m2.7` |
- Prompt payloads:
  - the app owns council orchestration; model prompts do not narrate membership
    or hidden workflow
  - system prompts join the editable role instruction and immutable output
    contract with one canonical blank-line separator
  - each phase-2 evaluator receives the same six candidate answers as a JSON
    payload, returns a compact `reviews` array keyed by candidate ID with per-candidate
    scores, and the app derives the ranking; phase-3 receives the six candidate
    answers plus compact reviewer summaries with reviewer IDs, rankings,
    final-answer input bullets, major disagreements, and per-candidate
    score/`verdict_input` rows as JSON payloads whose strings are treated as
    data, not new instructions
  - phase-2 review JSON is requested through a compact portable OpenRouter structured-output schema,
    validated, normalized, and only then persisted as phase-3 reference
    material; the provider-visible contract carries compact shape and prose
    instructions, while the app parser owns candidate count, score range, list
    bounds, material prose, and string-length enforcement after the complete
    provider response
- Provider requests:
  - every OpenRouter request sends a server-owned `max_tokens` output cap
  - provider-call diagnostics expose sent `provider.require_parameters` and the
    `amazon-bedrock`/`azure` provider ignore list
  - streaming diagnostics preserve the provider response model when OpenRouter
    sends one and otherwise fall back to the exact requested model ID only when a
    generation ID is present
  - unsupported tuning, missing output-cap support, expired catalog rows, and
    missing phase-2 structured-output support deny before provider execution
- Auth:
  - BYOK: `Authorization: Bearer <openrouter_api_key>`
  - Demo: `HttpOnly` cookie set by `GET /api/v1/demo/consume`
- Edge semantics:
  - malformed JSON returns `400 invalid_input`
  - invalid ingress headers return `400 invalid_input`
  - invalid BYOK keys return `401 unauthorized`
  - upstream OpenRouter and Resend transport failures return `502 upstream_error`
- Rate limiting:
  - ingress flood limits run before auth admission and user/session lookup
  - all fixed-window limits use one atomic admit-and-count path
  - accepted demo email requests consume quota before email delivery and are not
    refunded

## Development

```bash
pnpm install
cp .env.local.example .env.local   # then fill in values
pnpm local:doctor
pnpm local:bootstrap -- --install
pnpm local:db:up
pnpm local:dev   # `pnpm dev` is the same canonical local launcher
```

Canonical local path:

- Docker Desktop provides the only supported local Postgres runtime.
- `compose.yaml` owns the local database on `127.0.0.1:5432`.
- `pnpm local:*` rejects non-local `DATABASE_URL` targets instead of proving
  against staging or production by accident.
- `.env.local` provides the app environment (see `.env.local.example`).
- `pnpm local:*` is the only canonical local operator surface.

Minimal The Seven slice keys:

```bash
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/the_seven
SEVEN_JOB_CREDENTIAL_SECRET=replace-with-a-long-random-secret
SEVEN_PUBLIC_ORIGIN=http://localhost
SEVEN_APP_NAME=The Seven
SEVEN_DEMO_ENABLED=0
```

`SEVEN_JOB_CREDENTIAL_SECRET` is required for durable background execution. It
is used only for context-bound envelope encryption of short-lived job
credentials and never stores plaintext API keys at rest.

Live-provider overlay keys are documented in `.env.live.example`:

```bash
SEVEN_PUBLIC_ORIGIN=https://theseven.ai
SEVEN_BYOK_KEY=
SEVEN_DEMO_ENABLED=1
SEVEN_DEMO_OPENROUTER_KEY=
SEVEN_DEMO_RESEND_API_KEY=
SEVEN_DEMO_EMAIL_FROM=hello@example.com
SEVEN_DEMO_TEST_EMAIL=
```

`SEVEN_DEMO_TEST_EMAIL` must point at a dedicated Resend-backed inbound mailbox
that allows message listing and retrieval through the Resend Receiving API.

`SEVEN_DEMO_RESEND_API_KEY` must be a Resend API key with received-email access.
Send-only restricted keys are not sufficient for `pnpm test:live` or
`pnpm local:live`.

`pnpm dev`, `pnpm local:dev`, `pnpm local:live`, and full browser gates allocate
a free loopback port and project `PORT` plus `SEVEN_BASE_URL` for the child
process. They also project `SEVEN_NEXT_DIST_DIR=.next-local/<port>` to isolate
Next's local dev `distDir` so a browser proof can run while a separate dev
server already owns `.next/dev/lock`. Direct
`@the-seven/web` dev starts require this projected environment and fail closed
without it. `SEVEN_PUBLIC_ORIGIN` is the server-owned origin used in demo magic
links, OpenRouter app headers, and same-origin checks for demo-cookie mutations.
A loopback public origin is rewritten to the allocated local port; an explicit
non-loopback origin such as `https://theseven.ai` is preserved for live proof.
Reserved runtime keys come from `.env.local`; ambient shell values do not
override that file for `pnpm local:*` commands. `pnpm local:gate --full` also
clears reserved runtime/projection keys before build and test phases.
`pnpm local:live` also requires exclusive same-repo job-worker ownership. Stop
any existing `pnpm local:dev` / `next dev` process for this repo before live
proof; otherwise an old worker can claim DB jobs even though HTTP uses a
different free port.

## Operator Commands

```bash
pnpm local:doctor
pnpm local:doctor --live
pnpm local:bootstrap -- --install
pnpm local:db:up
pnpm local:db:reset
pnpm local:gate --full
pnpm local:live
```

`pnpm local:doctor` validates minimal local readiness and does not require live
provider keys. `pnpm local:doctor --live` validates the same local readiness plus
live-proof keys and effective local secret-file permissions.

On Node runtime boot, the app applies the single squashed init SQL before the
durable worker starts. A blank compose-managed Postgres database is a valid
starting state. Existing local The Seven tables must match the current squashed
schema; otherwise `pnpm local:db:up` fails closed and the operator resets the
local volume with `pnpm local:db:reset`. There are no local migration shims.

CLI batch input is JSONL. Each line uses the canonical query shape:

```json
{"query":"Your question","councils":["built_in:founding"]}
```

## Demo Flow

The browser requests a magic link with `POST /api/v1/demo/request`. The email
link points at `GET /api/v1/demo/consume?token=...`. The server consumes the
one-time token, sets the demo cookie, and redirects with `303` to
`<SEVEN_PUBLIC_ORIGIN>/`. Demo authority is the server-issued `HttpOnly` cookie.

## Validation

Always:

```bash
pnpm local:doctor
pnpm local:db:up
pnpm run db:bootstrap:check
pnpm local:gate --full
```

If live keys are present:

```bash
pnpm local:doctor --live
pnpm local:db:reset
pnpm local:live
```

`pnpm local:live` validates all three built-in tiers through the live catalog,
proves the capped demo Commons flow before the heavy BYOK completion sequence,
runs one full BYOK session for each tier, and keeps all proof under the same
local app projection. Completed sessions must contain the exact selected
built-in roster, six nonblank phase-1 response artifacts, six phase-2 review
artifacts, one nonblank phase-3 synthesizer artifact, successful provider calls
at every expected member position, sent tier-owned reasoning effort, sent
compact phase-2 `response_format`, no denied provider parameters, and the
expected 8192/16384/16384 `max_tokens` caps. Provider chat completions use OpenRouter
streaming internally, while stored artifacts and public diagnostics remain
complete-response records.
The command fails closed before starting live proof if another same-repo local
dev worker can claim jobs from the same database.

`pnpm local:live` is repeatable in the same local database. It clears only
proof-owned demo rate-limit buckets for the configured demo test inbox before
requesting a fresh magic link; it does not disable product rate limits.

Production release smoke proves the deployed public surface without provider,
email, or authenticated side effects. `GET /` must render, and unauthenticated
`GET /api/v1/demo/session` must return the declared 401 error envelope with a
trace header through the normal ingress and rate-limit path. Run it with:

```bash
pnpm public:smoke https://theseven.ai
```

If live keys are absent, live proof is blocked with the exact missing keys.

## Docs

- [`VISION.md`](VISION.md) — product outcomes and non-goals
- [`ARCH.md`](ARCH.md) — canonical architecture, contracts, citations, and owner maps
- [`docs/BOUNDARY_REPLACEMENT_MAP.md`](docs/BOUNDARY_REPLACEMENT_MAP.md) — old-to-new surface map
- [`docs/CANONICAL_SURFACES.md`](docs/CANONICAL_SURFACES.md) — launch surface owners and gate boundary
- [`docs/PACKAGE_POLICY.md`](docs/PACKAGE_POLICY.md) — package and workspace rules
- [`docs/VALIDATION_MATRIX.md`](docs/VALIDATION_MATRIX.md) — verification requirements
