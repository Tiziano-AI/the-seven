# Handoff

Launch-quality greenfield refactor plus the 2026-05-10 dependency refresh are
implemented and validated.

## Current State

- Fresh OpenRouter catalog probe on 2026-05-10 returned status 200 and 367
  models. Built-ins use the current Founding, Lantern, and Commons rosters
  documented in `ARCH.md`; stale and expiring model IDs are not compatibility
  aliases.
- Commons uses `arcee-ai/trinity-large-thinking` in slot 6 and low reasoning
  effort for every built-in Commons member. Lantern uses medium reasoning
  effort and Founding uses xhigh reasoning effort. The prior
  `nvidia/nemotron-3-super-120b-a12b` slot is retired because live proof hit an
  OpenRouter choice `502` network-loss error. `z-ai/glm-4.7-flash` is also
  retired because production live proof returned empty phase-2 content.
- A local live proof with Commons xhigh reasoning failed the 10-minute demo
  deadline while direct OpenRouter probes with low reasoning returned quickly
  for `deepseek/deepseek-v4-flash`, `openai/gpt-5.4-nano`,
  `qwen/qwen3.6-flash`, `google/gemma-4-31b-it`, `inception/mercury-2`,
  `x-ai/grok-code-fast-1`, and other candidate models. Commons latency is owned
  by tier tuning, not by broad retired-string heuristics.
- `tiz-home --json secrets doctor` passes with `/Users/tiziano/.secrets/ALL.env`
  as the master pool and `/Users/tiziano/.secrets/the-seven.env` as the
  generated app slice. `.env.local` is a symlink to that slice. Secret root mode
  is `0700`; secret files are `0600`; `needs_sync=false`.
- `pnpm local:live` is repeatable in the same local database because it clears
  only proof-owned demo rate-limit buckets for the configured demo test inbox,
  loopback IP scopes, and demo proof global scopes before requesting a fresh
  magic link. Runtime route-level rate limits remain product behavior.
- The dependency refresh uses Biome `2.4.15`, Vitest `4.1.5`, TypeScript
  `6.0.3`, `@types/node` `25.6.2`, and the matching Biome schema URL.

## Validation

- `pnpm local:doctor` passed.
- `pnpm local:db:up` passed.
- `pnpm run db:bootstrap:check` passed.
- `uv run --python 3.12 devtools/gate.py --full` passed with lint, typecheck,
  20 Vitest files / 71 tests, production build, bootstrap check, and Playwright
  smoke.
- `pnpm local:doctor --live` passed.
- Latest `pnpm local:live` passed end to end after the Commons slot-6
  production reliability fix and tier-owned reasoning policy:
  - BYOK auth validation, model validation, autocomplete, and council CRUD
    passed.
  - BYOK session `1` completed with 6 phase-1 responses, 6 phase-2 reviews, 1
    synthesis, completed provider diagnostics for all phases, and no
    provider-call errors.
  - Demo magic-link request, Resend received-email lookup, consume redirect,
    HttpOnly demo cookie session, and demo session submit passed.
  - Demo session `2` completed with 6 phase-1 responses, 6 phase-2 reviews, 1
    synthesis, completed provider diagnostics for all phases, and no
    provider-call errors.
  - Browser smoke passed for home, demo-authenticated councils page, and the
    completed demo session page.

## Resume Instructions

- Commit, push, deploy Railway, and rerun
  `SEVEN_BASE_URL=https://theseven.ai pnpm test:live` for public launch proof.
- If provider catalog or model quality changes, refresh `ARCH.md`,
  `packages/config/src/builtInCouncils.ts`, and
  `packages/config/src/builtInCouncils.test.ts` together before rerunning the
  validation commands above.
