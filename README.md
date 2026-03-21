# The Seven

The Seven is a privacy-first multi-model council for hard questions.

- Bring your own OpenRouter key, encrypt it locally, and keep it out of server storage.
- Or use the demo flow: email magic link, 24-hour session, Commons Council only.
- Every run snapshots a 7-member council, executes reply → critique → verdict, and preserves the full record.

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

## Development

```bash
pnpm install
pnpm dev
```

Required environment:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/the_seven
SEVEN_JOB_CREDENTIAL_SECRET=replace-with-a-long-random-secret
SEVEN_PUBLIC_ORIGIN=http://localhost:3000
SEVEN_APP_NAME=The Seven
```

`SEVEN_JOB_CREDENTIAL_SECRET` is required for durable background execution. It is used only for envelope encryption of short-lived job credentials and never stores plaintext API keys at rest.

On Node runtime boot, the app applies the single squashed init SQL before the durable worker starts. A blank Postgres database is a valid starting state.

CLI batch input is JSONL. Each line uses the canonical query shape:

```json
{"query":"Your question","councils":["built_in:founding"]}
```

Optional demo environment:

```bash
SEVEN_DEMO_ENABLED=1
SEVEN_DEMO_OPENROUTER_KEY=...
SEVEN_DEMO_RESEND_API_KEY=...
SEVEN_DEMO_EMAIL_FROM=hello@example.com
```

## Validation

```bash
uv run --python 3.12 devtools/gate.py --full

pnpm run lint
pnpm run check
pnpm run test
pnpm run test:e2e
pnpm run build
pnpm run db:bootstrap:check
```

## Docs

- `ARCH.md` — canonical architecture
- `docs/BOUNDARY_REPLACEMENT_MAP.md` — old-to-new surface map
- `docs/RETIREMENT_MANIFEST.md` — same-change deletions
- `docs/PACKAGE_POLICY.md` — package and workspace rules
- `docs/VALIDATION_MATRIX.md` — verification requirements
