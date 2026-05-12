# The Seven

The Seven is a privacy-first multi-model council for hard questions. Seven
language models answer the prompt, evaluate each other's drafts, and a final
phase synthesizes one verdict from the request, candidates, and parsed
evaluations. The whole run is preserved as a durable record so the reasoning
trail stays inspectable.

It is bring-your-own-key by default — your OpenRouter key is hashed and held
out of server storage. A paid low-cost demo flow is available behind an email
magic link.

- Three built-in councils: Founding (best-of-best with xhigh reasoning effort),
  Lantern (mid-tier bridge with medium effort), Commons (low-cost demo with low
  effort). All 21 built-in model ids are distinct across the three tiers.
- User-defined councils persist as one aggregate definition with shared phase
  prompts and exactly seven member slots.
- Default prompts are intentionally plain one-shot roles: phase 1 answers,
  phase 2 evaluates candidates, and phase 3 produces the final answer from the
  request, candidates, and parsed evaluations.
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
  - Founding: current best-of-best BYOK roster with xhigh reasoning effort;
    provider diversity is a tie-breaker, not a substitute for stronger models
  - Lantern: deliberate mid-tier bridge roster with medium reasoning effort
  - Commons: paid low-cost demo roster with low reasoning effort and no free or
    preview aliases
  - all 21 built-in model IDs are distinct across the three tier clusters
- Prompt payloads:
  - the app owns council orchestration; model prompts do not narrate membership
    or hidden workflow
  - system prompts join the editable role instruction and immutable output
    contract with one canonical blank-line separator
  - phase-2 candidate answers and phase-3 evaluations travel as JSON payloads
    whose strings are treated as data, not new instructions
  - phase-2 review JSON is requested through OpenRouter structured output,
    validated, normalized, and only then persisted as phase-3 reference material
- Auth:
  - BYOK: `Authorization: Bearer <openrouter_api_key>`
  - Demo: `HttpOnly` cookie set by `GET /api/v1/demo/consume`
- Edge semantics:
  - malformed JSON returns `400 invalid_input`
  - invalid ingress headers return `400 invalid_input`
  - invalid BYOK keys return `401 unauthorized`
  - upstream OpenRouter and Resend transport failures return `upstream_error`
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
pnpm local:dev
```

Canonical local path:

- Docker Desktop provides the only supported local Postgres runtime.
- `compose.yaml` owns the local database on `127.0.0.1:5432`.
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

`pnpm local:dev`, `pnpm local:live`, and full browser gates allocate a free
loopback port and project `PORT` plus `SEVEN_BASE_URL` for the child process.
They also isolate Next's local dev `distDir` so a browser proof can run while a
separate dev server already owns `.next/dev/lock`. `SEVEN_PUBLIC_ORIGIN` is the
server-owned origin used in demo magic links, OpenRouter app headers, and
same-origin checks for demo-cookie mutations. A loopback public origin is
rewritten to the allocated local port; an explicit non-loopback origin such as
`https://theseven.ai` is preserved for live proof.

## Operator Commands

```bash
pnpm local:doctor
pnpm local:doctor --live
pnpm local:bootstrap -- --install
pnpm local:db:up
pnpm local:db:reset
pnpm local:gate
pnpm local:live
```

`pnpm local:doctor` validates minimal local readiness and does not require live
provider keys. `pnpm local:doctor --live` additionally validates live-proof keys
and effective local secret-file permissions.

On Node runtime boot, the app applies the single squashed init SQL before the
durable worker starts. A blank compose-managed Postgres database is a valid
starting state.

CLI batch input is JSONL. Each line uses the canonical query shape:

```json
{"query":"Your question","councils":["built_in:founding"]}
```

## Demo Flow

The browser requests a magic link with `POST /api/v1/demo/request`. The email
link points at `GET /api/v1/demo/consume?token=...`. The server consumes the
one-time token, sets the demo cookie, and redirects to `/`. Demo authority is
the server-issued `HttpOnly` cookie.

## Validation

Always:

```bash
pnpm local:doctor
pnpm local:db:up
pnpm run db:bootstrap:check
uv run --python 3.12 devtools/gate.py --full
```

If live keys are present:

```bash
pnpm local:doctor --live
pnpm local:live
```

`pnpm local:live` is repeatable in the same local database. It clears only
proof-owned demo rate-limit buckets for the configured demo test inbox before
requesting a fresh magic link; it does not disable product rate limits.

If live keys are absent, live proof is blocked with the exact missing keys.

## Docs

- [`VISION.md`](VISION.md) — product outcomes and non-goals
- [`ARCH.md`](ARCH.md) — canonical architecture, contracts, citations, and owner maps
- [`docs/BOUNDARY_REPLACEMENT_MAP.md`](docs/BOUNDARY_REPLACEMENT_MAP.md) — old-to-new surface map
- [`docs/CANONICAL_SURFACES.md`](docs/CANONICAL_SURFACES.md) — launch surface owners and gate boundary
- [`docs/PACKAGE_POLICY.md`](docs/PACKAGE_POLICY.md) — package and workspace rules
- [`docs/VALIDATION_MATRIX.md`](docs/VALIDATION_MATRIX.md) — verification requirements
