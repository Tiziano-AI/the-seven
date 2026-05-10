# The Seven

The Seven is a privacy-first multi-model council for hard questions.

- Bring your own OpenRouter key, encrypt it locally, and keep it out of server
  storage.
- Or use the demo flow: email magic link, 24-hour server cookie, Commons Council
  only. Commons is paid low-cost, not a free-model showcase.
- Every run snapshots a 7-member council, executes reply -> critique -> verdict,
  and preserves the full record.
- User-defined councils persist as one aggregate definition with shared phase
  prompts and exactly seven member slots.
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
  - Founding: current best-of-best BYOK roster with xhigh reasoning effort
  - Lantern: deliberate mid-tier bridge roster with medium reasoning effort
  - Commons: paid low-cost demo roster with low reasoning effort and no free or
    preview aliases
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
ln -s /Users/tiziano/.secrets/the-seven.env .env.local
pnpm local:doctor
pnpm local:bootstrap -- --install
pnpm local:db:up
pnpm local:dev
```

Canonical local Mac path:

- Docker Desktop provides the only supported local Postgres runtime.
- `compose.yaml` owns the local database on `127.0.0.1:5432`.
- `/Users/tiziano/.secrets/ALL.env` is the human-owned master secret pool.
- `THE_SEVEN__...` keys materialize into `/Users/tiziano/.secrets/the-seven.env`.
- `.env.local` is the repo-local symlink to the app slice.
- `pnpm local:*` is the only canonical local operator surface.

Minimal The Seven slice keys:

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/the_seven
SEVEN_JOB_CREDENTIAL_SECRET=replace-with-a-long-random-secret
SEVEN_PUBLIC_ORIGIN=http://localhost:3000
SEVEN_APP_NAME=The Seven
SEVEN_DEMO_ENABLED=0
SEVEN_BASE_URL=http://127.0.0.1:3000
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

`SEVEN_BASE_URL` is the local HTTP target for live tooling. `SEVEN_PUBLIC_ORIGIN`
is the server-owned origin used in demo magic links, OpenRouter app headers, and
same-origin checks for demo-cookie mutations.

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
and effective local secret-file permissions. `tiz-home --json secrets doctor`
validates the master pool, app slice, and projection without printing values.

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

If live keys are absent, live proof is `[blocked]` in `HANDOFF.md` with the exact
missing keys.

## Docs

- `VISION.md` - product outcomes and non-goals
- `ARCH.md` - canonical architecture, contracts, citations, and owner maps
- `docs/BOUNDARY_REPLACEMENT_MAP.md` - old-to-new surface map
- `docs/CANONICAL_SURFACES.md` - launch surface owners and gate boundary
- `docs/PACKAGE_POLICY.md` - package and workspace rules
- `docs/VALIDATION_MATRIX.md` - verification requirements
