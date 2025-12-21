# Vision

The Seven is a privacy-first, BYOK multi-model orchestration app: 7 fixed **members** (slots) run provider models. 6 “reviewers” produce independent answers, then review each other, then a 7th “synthesizer” produces a final answer.

## Who

- People who already have an OpenRouter API key and want higher-quality answers than a single model run.
- Users who want control: models and prompts are editable, defaults are always recoverable.

## Non‑Negotiables

- BYOK identity: the OpenRouter API key is the identity anchor (via a non-reversible hash).
- Browser persistence: only the encrypted API key blob is persisted client-side.
- Server persistence: the server stores sessions, artifacts, and councils; it never stores the plaintext API key.
- Provider traffic: the browser never calls OpenRouter directly; all provider calls happen server-side.
- Best-effort jobs: in-flight orchestration is not durable (no server-side key storage and no job queue). Sessions are persisted to SQLite and survive restarts.

## User Experience (Target)

- Setup: paste OpenRouter key → choose password → key is encrypted and stored locally; password never leaves the browser.
- Use: submit a query (+ optional file attachments) → watch responses/reviews/synthesis arrive → inspect artifacts and costs.
- Customize:
  - Councils are saved 7-slot lineups (`A–G`) that define the 6 “members” + the final “verdict” model.
  - Prompts are editable only at the phase layer (Phase 1/2/3). There are no per-member prompt overrides.
  - Members may optionally expose a small set of high-signal tuning controls when the selected model supports them.
  - Built-in councils ship as immutable templates; users Duplicate to edit their own councils.
- Recovery + reruns are explicit and never overwrite history:
  - **Continue**: if a session is interrupted and ends `failed`, you can continue the *same* session run.
    - Already-delivered artifacts are preserved; only missing inference is executed.
    - Continue uses the original run snapshot.
  - **Rerun**: create a new session id and rerun the question with an explicitly chosen council (optionally with a query override).

## Non‑Goals

- No account system / OAuth.
- No server-side key escrow or key recovery.
- No durable background job queue or automatic reruns (reruns are explicit user actions).
- No multi-provider abstraction beyond OpenRouter (OpenRouter remains the first-class provider boundary).

Last updated: 2025-12-18.
