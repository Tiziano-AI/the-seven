# Vision

The Seven is a privacy-first, BYOK multi-model orchestration app: 7 fixed **members** (slots) run provider models. 6 “reviewers” produce independent answers, then each reviewer evaluates all 6 candidate answers, then a 7th “synthesizer” produces a final answer.

It also offers a zero-friction demo path (email → magic link) that uses a server-owned OpenRouter key and the Commons Council so new users can try the flow without a BYOK setup. Commons uses paid low-cost models that are reliable enough to represent the product; it is not a free-model showcase.

## Who

- People who already have an OpenRouter API key and want higher-quality answers than a single model run.
- People who want a zero-friction demo before bringing their own key (email → magic link).
- Users who want control: models and prompts are editable, defaults are always recoverable.
- Users who want the orchestration to stay app-owned: provider models receive
  plain one-shot answer, evaluation, or final-answer roles instead of product
  mythology.

## Non‑Negotiables

- BYOK identity: the OpenRouter API key is the identity anchor (via a non-reversible hash).
- Demo identity: the server-issued demo cookie is the browser authority; normalized email is stored server-side and sessions expire in 24 hours.
- Key requirements: BYOK requires a user OpenRouter key; demo on theseven.ai uses a server-owned key (self-hosted demos provide their own).
- Browser persistence: the encrypted API key blob (BYOK) and minimal UI state (`seven.active_session_id`, `seven.last_council_ref`, `seven.draft.query`) are persisted client-side. Demo authority stays in the server-issued `HttpOnly` cookie.
- Server persistence: the server stores sessions, artifacts, and councils; it never stores plaintext BYOK keys.
- Provider traffic: the browser never calls OpenRouter directly; all provider calls happen server-side.
- Durable jobs: orchestration is persisted in PostgreSQL and resumes after restarts through a leased job runner. Short-lived worker credentials are envelope-encrypted at rest and deleted when the job reaches a terminal state.

## User Experience (Target)

The UI is a serious scholarly council workbench. It uses medieval and early
print-culture cues as institutional structure: docket, proceedings, verdict,
archive, seats, sigils, seals, marginalia, and ruled folio surfaces. It does
not present as a generic SaaS dashboard or a fantasy game skin.

- Setup (BYOK): paste OpenRouter key → choose password → key is encrypted and stored locally; password never leaves the browser.
- Setup (demo): enter email → receive magic link → 24‑hour session starts immediately.
- BYOK admission selects the Founding Council by default, so a paid-key user
  starts on the strongest roster unless they intentionally choose Lantern or
  Commons.
- Use: file a matter (+ optional evidence exhibits) → watch six reviewers and the synthesizer move through proceedings → inspect drafts, critiques, verdict, provider record, and costs.
- Customize (BYOK only):
  - Councils are saved 7-slot lineups (`A–G`) that define the 6 “members” + the final “verdict” model.
  - Prompts are editable only at the phase layer (Phase 1/2/3). There are no per-member prompt overrides.
  - Member model selection validates against the current catalog, shows readable model names before provider slugs, and exposes only the high-signal tuning controls the selected model supports.
  - Three built-in councils ship as immutable templates: Founding is the BYOK best-of-best roster, Lantern is the deliberate mid-tier bridge, and Commons is the paid low-cost demo roster. The 21 built-in model IDs are distinct across those tier clusters; users Duplicate to edit their own.
- Demo constraints:
  - Demo runs use the Commons Council only; councils and models are not editable.
  - Prompts and attachments behave the same as BYOK runs.
- Recovery + reruns are explicit and never overwrite history:
  - **Continue**: if a session is interrupted and ends `failed`, you can continue the *same* session run.
    - Already-delivered artifacts are preserved; only missing inference is executed.
    - Continue uses the original run snapshot.
  - **Rerun**: create a new session id and rerun the matter with an explicitly chosen council (optionally with a query override).
  - Restart recovery: queued and leased jobs recover through the durable job table instead of silently stalling after a process restart.

## Non‑Goals

- No account system / OAuth (demo uses one-time email links, not accounts).
- No server-side key escrow or key recovery.
- No automatic semantic retries that fabricate missing artifacts; recovery may replay only durable state and explicit user actions.
- No multi-provider abstraction beyond OpenRouter (OpenRouter remains the first-class provider boundary).
- No novelty fantasy chrome. The scholarly/council identity is expressed
  through typography hierarchy, disciplined density, rules, folio surfaces,
  sigils, docket language, and traceable proceedings rather than glows, casino
  gradients, full-pill controls, or display-font UI text.

Last updated: 2026-05-15.
