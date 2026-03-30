# The Seven

The Seven is a privacy-first multi-model council for hard questions.

- Bring your own OpenRouter key, encrypt it locally, and keep it out of server storage.
- Or use the demo flow: email magic link, 24-hour session, Commons Council only.
- Every run snapshots a 7-member council, executes reply → critique → verdict, and preserves the full record.
- User-defined councils persist as one aggregate definition with shared phase prompts and exactly seven member slots.
- Identity is canonicalized as `users(kind, principal)`: BYOK principals are hashed API keys and demo principals are normalized emails.

## Stack

- Next App Router
- React 19
- Tailwind v4 + shadcn/ui
- Zod
- PostgreSQL + Drizzle + `pg`
- Biome

## Workspace

- `apps/web` — product UI and `/api/v1`
- `apps/cli` — batch client against `/api/v1`
- `packages/contracts` — shared schemas and envelopes
- `packages/config` — prompts, built-ins, env schema, limits
- `packages/db` — Drizzle schema and persistence

## Runtime Contract

- UI routes: `/`, `/councils`, `/sessions`, `/sessions/[id]`
- API routes: `/api/v1/**`
- Auth:
  - `Authorization: Bearer <openrouter_api_key>`
  - `Authorization: Demo <demo_session_token>`
- Edge semantics:
  - malformed JSON returns `400 invalid_input`
  - upstream OpenRouter and Resend failures return `upstream_error`
- Rate limiting:
  - all fixed-window limits use one atomic admit-and-count path
  - accepted demo email requests consume quota before email delivery and are not refunded

## Development

```bash
pnpm install
pnpm local:doctor
pnpm local:bootstrap -- --install
cp .env.local.example .env.local
pnpm local:db:up
pnpm local:dev
```

Canonical local Mac path:

- Docker Desktop provides the only supported local Postgres runtime.
- `compose.yaml` owns the local database on `127.0.0.1:5432`.
- `.env.local` is the only canonical local secrets file.
- `pnpm local:*` is the only canonical local operator surface.

Core `.env.local` keys:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/the_seven
SEVEN_JOB_CREDENTIAL_SECRET=replace-with-a-long-random-secret
SEVEN_PUBLIC_ORIGIN=http://localhost:3000
SEVEN_APP_NAME=The Seven
```

`SEVEN_JOB_CREDENTIAL_SECRET` is required for durable background execution. It is used only for envelope encryption of short-lived job credentials and never stores plaintext API keys at rest.

Optional live-provider `.env.local` keys:

```bash
SEVEN_BYOK_KEY=
SEVEN_DEMO_ENABLED=1
SEVEN_DEMO_OPENROUTER_KEY=
SEVEN_DEMO_RESEND_API_KEY=
SEVEN_DEMO_EMAIL_FROM=hello@example.com
SEVEN_DEMO_TEST_EMAIL=
```

`SEVEN_DEMO_TEST_EMAIL` must point at a dedicated Resend-backed inbound mailbox that emits `email.received` webhooks and allows message retrieval through the Resend Receiving API.

`SEVEN_DEMO_RESEND_API_KEY` must be a Resend API key with webhook-management and received-email access. Send-only restricted keys are not sufficient for `pnpm test:live` or `pnpm local:live`.

On Node runtime boot, the app applies the single squashed init SQL before the durable worker starts. A blank compose-managed Postgres database is a valid starting state.

CLI batch input is JSONL. Each line uses the canonical query shape:

```json
{"query":"Your question","councils":["built_in:founding"]}
```

Canonical local commands:

```bash
pnpm local:doctor
pnpm local:bootstrap -- --install
pnpm local:db:up
pnpm local:db:reset
pnpm local:gate
pnpm local:live
```

## Validation

```bash
pnpm local:gate
pnpm test:live
pnpm run test:e2e
uv run --python 3.12 devtools/gate.py --full
```

`pnpm local:gate` fails fast with an actionable Postgres error if the compose-managed database is not healthy.

`pnpm local:live` starts the app locally, provisions a temporary Cloudflare quick tunnel plus Resend webhook for the demo inbox flow, runs the live provider smoke, runs Playwright against the externally started server, and then cleans up the tunnel, webhook, and app process.

## Docs

- `ARCH.md` — canonical architecture
- `docs/BOUNDARY_REPLACEMENT_MAP.md` — old-to-new surface map
- `docs/RETIREMENT_MANIFEST.md` — same-change deletions
- `docs/PACKAGE_POLICY.md` — package and workspace rules
- `docs/VALIDATION_MATRIX.md` — verification requirements
