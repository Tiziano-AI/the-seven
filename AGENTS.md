# AGENTS.md - The Seven operator guide

This is the repository-local operating guide for future agents working in
The Seven. Treat it as durable guidance, but let current repo evidence win when
it conflicts with this file. If `README.md`, `VISION.md`, `ARCH.md`, `docs/**`,
source, tests, config, generated proof, production, or live provider behavior
disagree, record the conflict in the unresolved-conflicts section instead of
silently choosing the convenient surface.

## Product purpose

The Seven is a privacy-first multi-model council for hard questions. Six
reviewer models answer a request, each reviewer evaluates all six candidate
answers, and a seventh synthesizer produces the final answer from the request,
candidate answers, and compact reviewer summaries.

Core product invariants:

- BYOK is browser-owned. The server never durably stores plaintext OpenRouter
  keys; durable jobs use context-bound encrypted short-lived credentials that
  are cleared on terminal job state.
- Demo is server-owned cookie authority. Email magic links issue a 24-hour
  `HttpOnly` demo session limited to Commons.
- Provider traffic is server-side through OpenRouter. Browsers never call
  OpenRouter directly.
- Runs are immutable history. Continue resumes missing work in the same failed
  session; Run again creates a new session.
- The product is a scholarly council workbench with plain-language controls.
  Medieval/scholarly identity belongs to visual structure, typography,
  surfaces, sigils, and archival density, not fantasy route jargon.

## Start here

Before editing, inspect shared state:

```bash
cd /Users/tiziano/Code/the-seven
git status -sb
```

Read the governing surfaces in this order:

1. `VISION.md` - product outcomes, users, non-negotiables, and non-goals.
2. `ARCH.md` - canonical architecture, runtime contracts, owner maps, and
   validation bar.
3. `README.md` - operator/contributor path and public runtime contract.
4. `docs/CANONICAL_SURFACES.md` - launch surface owners and gate boundary.
5. `docs/VALIDATION_MATRIX.md` - proof requirements by behavior class.
6. `docs/PACKAGE_POLICY.md` - package/workspace admission rules.
7. `docs/BOUNDARY_REPLACEMENT_MAP.md` - retired-to-current boundary map.
8. `package.json`, `pnpm-workspace.yaml`, and workspace package manifests -
   command, dependency, engine, and package-manager boundaries.
9. `PLAN.md` and `HANDOFF.md` - workflow state only. These are tentative
   unless current git/source/runtime evidence confirms them.

## Canonical architecture and owners

- Workspace: one `pnpm` workspace with `apps/*` and `packages/*`.
- Package/runtime toolchain: root `package.json` pins `pnpm@10.32.1`,
  requires Node `>=22.0.0`, and owns root scripts. Workspace dependency
  versions stay explicitly pinned; new dependencies follow
  `docs/PACKAGE_POLICY.md`.
- Web app: `apps/web`, Next App Router on Node runtime.
  - API handlers live under `apps/web/src/app/api/v1/**/route.ts`.
  - Route handlers adapt registry rows to Next responses; they do not own the
    public HTTP contract independently.
  - Server-only auth/workflow/adapter/store code lives under
    `apps/web/src/server/**`.
  - UI components live under `apps/web/src/components/**`.
  - `apps/web/src/app/theme.css` owns raw tokens; adjacent app CSS files own the
    scholarly workbench class vocabulary.
- CLI: `apps/cli`, an HTTP-only batch client against `/api/v1`.
  - Root `package.json` exposes it as `pnpm batch`.
  - `apps/cli/src/batch.ts` owns JSONL parsing, CLI flags, concurrency, optional
    wait behavior, and `SEVEN_BYOK_KEY` / `SEVEN_BASE_URL` admission.
  - `apps/cli/src/batchHttp.ts` owns registry-backed submit/wait calls,
    `Authorization: Bearer <BYOK key>`, `X-Seven-Ingress: cli`, no-store
    validation, and `X-Trace-Id` / envelope trace matching.
- Contracts: `packages/contracts` owns route registry rows, Zod schemas,
  envelopes, typed error details, HTTP cache/trace contracts, and domain enums.
  Public route rows live in `packages/contracts/src/http/registryRoutes.ts`.
- Config: `packages/config` owns env profiles, built-in councils, prompts,
  limits, and OpenRouter app-header materialization.
- Database: `packages/db` owns Drizzle schema, query/transaction modules,
  test DB helpers, and the one squashed launch init SQL
  `packages/db/drizzle/0000_init.sql`.
- Attachments: `packages/contracts/src/domain/attachments.ts` owns public
  attachment limits and denials; `apps/web/src/server/domain/attachments.ts`
  owns MIME sniffing, document text extraction, parser timeouts, and decoded
  server payloads.
- Local operator tools:
  - `tools/local-dev.ts` owns root `pnpm local:*` command dispatch.
  - `tools/env-doctor.ts` owns `.env.local`, legacy `.env`, key-shape, and file
    mode checks.
  - `tools/local-postgres.ts` owns canonical compose Postgres target,
    configured-port projection, and port ownership checks.
  - `tools/local-operator-env.ts`, `tools/local-http.ts`,
    `tools/local-http-projection.ts`, `tools/next-dev.ts`, and
    `tools/next-dev-server.ts` own reserved-key scrubbing, free-port HTTP
    projection, launch-owned Next dev isolation, and Next env restoration.
  - `tools/gate-command.ts` and `devtools/gate.py` own the local full gate,
    guardrails, route type generation, and rendered-proof artifact checks.
- Live/public proof tools: `tools/live-test.ts`,
  `tools/live-session-proof.ts`, `tools/live-session-diagnostics.ts`,
  `tools/live-demo-cookie.ts`, `tools/live-demo-api.ts`,
  `tools/live-demo-origin.ts`, `tools/resend-live-proof.ts`,
  `tools/playwright-config.ts`, and `tools/public-smoke.ts` own live
  provider/demo email/cookie proof, registry-backed demo API envelopes,
  public-origin/Host authority, external-server browser proof,
  billing/diagnostics assertions, and public unauthenticated smoke.

No runtime code should be reintroduced in retired `client/`, `server/`, or
`shared/` roots. No second public API surface, tRPC surface, Express bootstrap,
Vite frontend build, or ad hoc local shell launcher should be added.

## Source, config, live, and proof boundaries

- Repo source proves only source. It does not prove live provider support,
  production deployment, secret presence, local worker ownership, or rendered UI.
- Public API truth is registry-first. Change the registry row, schemas, handler,
  client, fixtures, and tests together instead of parsing route params, query,
  or body ad hoc in a route file.
- `.env.local` is the app's local runtime source of truth for unprefixed
  variables. Ambient shell values do not override reserved runtime/projection
  keys for `pnpm local:*`.
- Workstation secret managers may hand-author, materialize, or symlink
  `.env.local`, but tracked product docs do not require a private home path.
  On this workstation, the sectioned `~/.secrets/envs.envset` master can
  materialize `~/.secrets/the-seven.env`; use `tiz-home --json secrets status`,
  `tiz-home --json secrets plan`, `tiz-home --json secrets keys list --env
  the-seven`, and only an explicitly authorized `tiz-home --json secrets apply`.
  Never print secret values.
- OpenRouter model rows, pricing, `supported_parameters`, and provider-routing
  behavior are volatile. Re-prove catalog and exact request compatibility before
  changing rosters or claiming current live launchability.
- Rendered UI claims require browser/rendered evidence. Unit/e2e green alone is
  insufficient for visual contract changes listed in `ARCH.md` and
  `docs/VALIDATION_MATRIX.md`.
- Local generated proof under `tmp/`, `test-results/`, `.playwright-mcp/`,
  `.next/`, or `.next-local/` is disposable runtime output unless a task
  explicitly promotes a durable artifact.
- Production claims require production readback, not local source. Use
  `pnpm public:smoke https://theseven.ai` after deployment reports success.

## Canonical local commands

Use `pnpm local:*` as the operator surface:

```bash
pnpm local:doctor
pnpm local:bootstrap -- --install
pnpm local:db:up
pnpm local:db:down
pnpm local:db:reset
pnpm local:dev
pnpm run db:bootstrap:check
pnpm local:gate --full
pnpm local:doctor --live
pnpm local:live
pnpm batch -- --file <path> [--wait] [--base-url URL]
pnpm public:smoke https://theseven.ai
```

Important command semantics:

- `pnpm dev` is only an alias for `pnpm local:dev`.
- `pnpm local:doctor` proves local readiness and does not require live provider
  keys.
- `pnpm local:doctor --live` adds live BYOK, demo OpenRouter, Resend sender,
  and demo test-inbox key checks.
- `pnpm local:gate --full` invokes `uv run --python 3.12 devtools/gate.py`
  through `tools/gate-command.ts`, clears reserved runtime/projection keys,
  proves owner guardrails before running checks, runs Next route type generation
  before TypeScript, and materializes its own browser-proof HTTP projection.
- `pnpm local:bootstrap -- --install` can install or repair local tool
  dependencies such as Homebrew formulae/casks and Playwright Chromium. Treat it
  as a package/tool mutation unless the task is local setup.
- `pnpm local:db:up` starts the compose-managed Postgres on the local
  `DATABASE_URL` port, defaulting to `127.0.0.1:55432`, accepts a blank DB, and
  fails closed if that configured port is owned by anything other than
  `the-seven-postgres` or if existing The Seven tables are stale.
- `pnpm local:db:reset` destroys the local compose volume before returning a
  blank current-schema database.
- `pnpm local:dev`, `pnpm local:live`, and full browser gates allocate a free
  loopback port and project `PORT`, `SEVEN_BASE_URL`, and local Next
  `distDir` isolation.
- `pnpm local:live` is live/cost-bearing. It starts a local app, uses real
  OpenRouter and Resend credentials, proves demo Commons before heavier BYOK
  runs, and refuses to run while another same-repo local worker can claim jobs.
  Before requesting a demo magic link it deletes only proof-owned demo
  rate-limit buckets for `SEVEN_DEMO_TEST_EMAIL`, loopback IP scopes, and demo
  proof global scopes so repeated live proofs stay deterministic; route-level
  rate limits remain product behavior and are tested separately.
- `pnpm batch` is a BYOK HTTP client, not an in-process execution path. Each
  JSONL line is shaped like
  `{"query":"...","councils":["built_in:founding"]}`; it requires
  `SEVEN_BYOK_KEY` and either `SEVEN_BASE_URL` or `--base-url`, then submits
  through the public `/api/v1/sessions` contract. Use it only against the
  intended local/public origin because it can create cost-bearing sessions.
- `pnpm public:smoke https://theseven.ai` is post-deploy public readback. It
  has no provider, email, or authenticated side effects; it proves the public
  home page renders and unauthenticated `GET /api/v1/demo/session` returns the
  expected `401` no-store error envelope with a matching trace header.

Minimal local setup:

```bash
pnpm install
cp .env.local.example .env.local
chmod 600 .env.local
pnpm local:doctor
pnpm local:bootstrap -- --install
pnpm local:db:up
pnpm local:dev
```

If using a workstation-specific secret env file instead of a hand-authored file,
keep the app-facing file as `.env.local` with unprefixed keys and mode no
broader than `0600`:

```bash
ln -sfn ~/.secrets/the-seven.env .env.local
```

## Validation bar

Choose validation by changed contract. Prefer focused proof first, then the
full gate when blast radius reaches shared contracts, UI, database, workflow,
or release behavior.

Always-on closeout gate:

```bash
pnpm local:doctor
pnpm local:db:up
pnpm run db:bootstrap:check
pnpm local:gate --full
```

Live closeout when live keys are present and launch/live-provider behavior is in
scope:

```bash
pnpm local:doctor --live
pnpm local:db:reset
pnpm local:live
```

Additional focused commands:

```bash
pnpm lint
pnpm check
pnpm test
pnpm test:e2e
pnpm test:live
```

Validation expectations:

- HTTP/API changes must prove registry schema parsing, envelope shape,
  `Cache-Control: no-store`, `X-Trace-Id`, denial rows, and transformed params.
- Auth/security changes must prove BYOK, demo cookie, same-origin, rate-limit,
  redaction, and invalid-ingress paths.
- Attachment changes must prove count, filename, byte-size, extension/MIME,
  unsupported MIME, parser-timeout, extracted-character, and redaction/error
  paths.
- Provider/workflow changes must prove durable job lifecycle, phase artifacts,
  OpenRouter diagnostics, structured-output parsing, output caps, retries,
  timeouts, cancellation/lease behavior, and terminal-state closeout.
- CLI batch changes must prove argument parsing, JSONL query validation,
  registry-backed submit/wait routes, BYOK authorization header, no-store
  response validation, trace-header/envelope equality, and error-envelope
  mapping.
- Live/demo proof changes must prove Resend receiving-body authority, absolute
  consume-link origin, public `Host` preservation over loopback transport,
  registry envelope/no-store/trace checks, and finite billing diagnostics.
- UI changes must include rendered desktop/tablet/mobile proof for the affected
  Workbench, Archive, inspector, recovery, copy/export, run-again, or council
  surfaces.
- DB changes must prove the squashed init SQL, schema compatibility, blank
  compose DB startup, stale local DB denial, and transaction/lease invariants.
- Package or workspace changes must follow `docs/PACKAGE_POLICY.md`, preserve
  pinned versions, keep package ownership boundaries intact, and use `pnpm`
  rather than npm/yarn/bun.

## Safety rules

- Preserve unrelated dirty work. Do not reset, stash, clean, broad-format,
  delete, stage, commit, push, deploy, or notify completion unless that exact
  action is in scope.
- Do not run `pnpm format` casually; it is a broad write. Use Biome checks or
  targeted formatting only when formatting is the authorized task.
- Do not mutate packages, lockfiles, Homebrew installs, Playwright browsers,
  Docker volumes, production, Railway, OpenRouter, Resend, or secret env files
  without explicit authorization for that mutation.
- Do not start `@the-seven/web` directly unless you also project the local HTTP
  environment that `pnpm local:dev`, `pnpm local:live`, and browser gates own.
- Do not print `.env.local`, `~/.secrets/*`, API keys, cookies, email tokens,
  provider prompts with secrets, or live proof raw transcripts.
- Do not commit generated/ignored runtime output such as `.next/`,
  `.next-local/`, `test-results/`, `tmp/`, `.playwright-mcp/`, `.DS_Store`, or
  screenshots unless a task explicitly changes a durable proof artifact.
- Do not weaken canonical contracts to match stale tests. Fix the owner seam or
  record the mismatch.
- Do not add aliases, shims, compatibility surfaces, or retired route/API names
  unless the current public contract explicitly requires them.
- New dependencies require evidence against `docs/PACKAGE_POLICY.md`: owner,
  maintenance, license, runtime fit, and why existing stack/native behavior is
  insufficient.

## Recovery playbook

- Missing or broad-mode `.env.local`: create it from `.env.local.example` or a
  private secret env file, then `chmod 600 .env.local` and rerun
  `pnpm local:doctor`.
- Legacy `.env` with runtime keys: move keys into `.env.local`; doctor rejects
  reserved runtime keys in `.env`.
- Missing local tools or Playwright Chromium: run `pnpm local:doctor` first and
  use its suggested fix. Only run `pnpm local:bootstrap -- --install` or
  `pnpm exec playwright install chromium` when package/tool installation is
  authorized.
- Local Postgres unhealthy: run `pnpm local:db:up` first. If doctor says the
  configured local `DATABASE_URL` port is owned by another Docker container or
  process, change The Seven's local `DATABASE_URL` to another free
  `127.0.0.1` port and rerun `pnpm local:db:up`; do not stop unrelated services
  just so The Seven can bind their port. Use `pnpm local:db:reset` only when
  destroying the local compose volume is acceptable.
- Existing same-repo worker blocks live proof: stop the old `pnpm local:dev` or
  `next dev` process before `pnpm local:live`.
- Clean checkout lacks Next route types: run the canonical gate path; it runs
  Next type generation before TypeScript checks.
- Live keys absent: record `[blocked]` with the exact missing key names in
  `HANDOFF.md`; do not mock launch proof.
- Provider quota/key/Resend/Railway/production blockers: record the exact
  blocker lane and latest proof surface in `HANDOFF.md`; do not claim release.
- Production changed or deployed: run `pnpm public:smoke https://theseven.ai`
  and inspect the rendered public surface before claiming public health.

## Active TODO / unresolved conflicts

Keep unresolved rows here until the owner surface is fixed or an operator
decision explicitly accepts the behavior.

- `agents-guide-tracking-contract`
  - Conflicting/current surfaces: `.gitignore` lists `AGENTS.md` under
    operating-state files, while this file is intended as durable repo-local
    guidance and may be tracked despite the ignore rule.
  - Proven current behavior: `git check-ignore -v --no-index -- AGENTS.md`
    points at the ignore rule, while `git ls-files -- AGENTS.md` is the
    source-of-truth probe for whether the guide is already tracked in the
    current checkout.
  - Intended claim: future agents should treat this guide as durable repository
    guidance, not disposable private notes.
  - Impact: normal edits to the already tracked guide stay tracked, but the
    ignore row can still make a missing or newly created guide look local-only;
    new agents may otherwise misclassify this file as disposable operating
    state.
  - Nearest owner and next probe: `.gitignore` plus this file. Decide whether
    to remove the `AGENTS.md` ignore row or document the tracked-file override,
    then rerun `git check-ignore -v --no-index -- AGENTS.md` and
    `git ls-files -- AGENTS.md`.
- `release-workflow-state-drift`
  - Conflicting/current surfaces: `PLAN.md`, `HANDOFF.md`, current git branch,
    deployment status, and public smoke proof.
  - Proven current behavior: `PLAN.md` says production deployment/public smoke
    remain; `HANDOFF.md` describes an older in-flight branch/review sequence.
    Treat both as workflow state, not architecture truth.
  - Intended claim: release completion requires final review, live proof,
    deployment readback, production logs/status, public smoke, and any requested
    completion notice.
  - Impact: do not claim launch/release completion from stale workflow notes or
    local source alone.
  - Nearest owner and next probe: release owner plus `PLAN.md`/`HANDOFF.md`.
    Refresh workflow state from current git/CI/deployment evidence, run the
    required live/public proof when authorized, then update or clear stale rows.
- `built-in-roster-currentness`
  - Conflicting/current surfaces: `ARCH.md`, `README.md`,
    `packages/config/src/builtInCouncils.ts`, OpenRouter catalog rows, and live
    provider probes.
  - Proven current behavior: repo docs and config define exact built-in rosters
    and cite dated catalog/probe evidence; external model availability,
    supported parameters, prices, and provider routing can drift.
  - Intended claim: built-ins are launchable only when exact current model rows
    support the app's required OpenRouter request shape and live proof passes.
  - Impact: do not update roster docs/config or assert current launchability
    from source alone.
  - Nearest owner and next probe: `packages/config/src/builtInCouncils.ts`,
    OpenRouter catalog evidence, structured-output probes, and
    `pnpm local:live`.
