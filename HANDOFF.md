# Handoff

Launch-quality greenfield refactor plus the 2026-05-10 dependency refresh are
implemented and validated.

## Current State

- Fresh OpenRouter catalog probe on 2026-05-10 returned status 200 and 367
  models. Built-ins use the current Founding, Lantern, and Commons rosters
  documented in `ARCH.md`; stale and expiring model IDs are not compatibility
  aliases.
- Founding is frontier-first, not provider-diversity filler. The 2026-05-10
  roster includes `openai/gpt-5.5` as a voting member and `openai/gpt-5.5-pro`
  as synthesizer. The 21 built-in model IDs are distinct across the three tier
  clusters. Kimi K2.6 and MiMo-V2.5-Pro remain in Founding because current
  Artificial Analysis and OpenRouter programming evidence keep them in the
  leading broad-model cluster; lower-ranked successors move to Lantern or
  Commons instead of duplicating Founding defaults.
- Commons uses `x-ai/grok-4.1-fast` in slot 6 and low reasoning
  effort for every built-in Commons member. Lantern uses medium reasoning
  effort and Founding uses xhigh reasoning effort. The prior
  `nvidia/nemotron-3-super-120b-a12b` slot is retired because live proof hit an
  OpenRouter choice `502` network-loss error. `z-ai/glm-4.7-flash` is also
  retired because production live proof returned empty phase-2 content.
  `arcee-ai/trinity-large-thinking` is retired because a final live proof
  returned non-JSON content once despite phase-2 `response_format`.
- Default hydrated instructions are flat one-shot role contracts rather than
  council mythology. Phase 1 is a precise assistant, phase 2 is an evaluator,
  and phase 3 is a precise final-answer assistant. Phase-2 candidate answers
  and phase-3 reference material are JSON payload data, not XML-style
  instruction wrappers. Phase-2 review calls send the contracts-owned structured
  JSON schema through OpenRouter `response_format` and persist only validated,
  normalized review JSON.
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
  20 Vitest files / 72 tests, production build, bootstrap check, and Playwright
  smoke.
- `pnpm local:doctor --live` passed.
- Direct OpenRouter BYOK probes on 2026-05-10 completed for all 21 selected
  built-in model IDs with tier-owned reasoning efforts. The 21 selected IDs are
  distinct across Founding, Lantern, and Commons.
- Latest `pnpm local:live` passed end to end after the structured phase-2
  output fix, distinct roster refresh, and tier-owned reasoning policy:
  - BYOK auth validation, model validation, autocomplete, and council CRUD
    passed.
  - BYOK session `9` completed with 6 phase-1 responses, 6 phase-2 reviews, 1
    synthesis, completed provider diagnostics for all phases, and no
    provider-call errors.
  - Demo magic-link request, Resend received-email lookup, consume redirect,
    HttpOnly demo cookie session, and demo session submit passed.
  - Demo session `10` completed with 6 phase-1 responses, 6 phase-2 reviews, 1
    synthesis, completed provider diagnostics for all phases, and no
    provider-call errors.
  - Browser smoke passed for home, demo-authenticated councils page, and the
    completed demo session page.
  - Provider diagnostics for sessions `9` and `10` show phase-2 calls sent
    `response_format`, had empty denied-parameter arrays, and recorded no
    provider or choice errors.

## Resume Instructions

- If provider catalog or model quality changes, refresh `ARCH.md`,
  `packages/config/src/builtInCouncils.ts`, and
  `packages/config/src/builtInCouncils.test.ts` together before rerunning the
  validation commands above.
