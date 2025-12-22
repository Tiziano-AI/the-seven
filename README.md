# The Seven

Multi-model LLM orchestration with peer review and synthesis.

Ask a question. Six models respond independently. Then they critique each other. Then a seventh synthesizes the verdict. Use the free demo via magic link, or bring your own OpenRouter API key—we never store user keys.

---

## How it works

Every run convenes a 7-member council:

1. **Phase 1 — Replies**: Six reviewers (A–F) respond in parallel
2. **Phase 2 — Critiques**: Each reviewer critiques the others
3. **Phase 3 — Verdict**: One synthesizer (G) delivers the final answer

Councils are configurable: swap models per slot, tune prompts per phase, save lineups for reuse.

---

## Built-in Councils

Three councils ship as immutable templates—duplicate one to customize:

| Council | Tier | Synthesizer |
|---------|------|-------------|
| **The Founding Council** | Frontier SOTA | GPT-5.2 Pro |
| **The Lantern Council** | Fast mid-tier | Gemini 3 Flash |
| **The Commons Council** | Free-tier only | DeepSeek R1 0528 |

---

## Security (BYOK)

- Your OpenRouter API key is encrypted and stored in your browser—never on the server
- The server uses your key per-request, then discards it
- All provider traffic is server-side; your browser never calls OpenRouter directly

## Demo mode (free)

- Enter an email to receive a magic link (no password).
- Demo sessions last 24 hours and are limited to the Commons Council (free-tier models).
- Demo runs use a server-owned OpenRouter key; prompts and attachments behave the same as BYOK runs.

---

## Quick start

```bash
# Prerequisites: Node.js, pnpm, OpenRouter API key

pnpm install
pnpm dev
```

Open the app, enter your OpenRouter key, pick a council, ask a question.

---

## Configuration

**Environment** (optional):

```bash
cp .env.example .env

# Core
SEVEN_DB_PATH=data/the-seven.db
SEVEN_PUBLIC_ORIGIN=http://localhost:3000
SEVEN_APP_NAME=The Seven

# Demo mode (optional)
SEVEN_DEMO_ENABLED=1
SEVEN_DEMO_OPENROUTER_KEY=...
SEVEN_DEMO_RESEND_API_KEY=...
SEVEN_DEMO_EMAIL_FROM=hello@updates.theseven.ai
```

In production, set `SEVEN_PUBLIC_ORIGIN` to your public domain (e.g. `https://theseven.ai`) and use a Resend‑verified sender address (e.g. `hello@updates.theseven.ai`).

**Councils**:

- Built-in councils are read-only templates
- Duplicate one to create an editable copy
- Configure models per slot (A–G), prompts per phase, and optional tuning knobs

---

## Development

```bash
pnpm dev          # Start dev server
pnpm test         # Run tests
pnpm check        # TypeScript check
pnpm build        # Production build

# Full gate (typecheck + tests + build)
uv run --python 3.12 devtools/gate.py
```

**Stack**: Express + HTTP JSON API, React 19 + Vite, SQLite + Drizzle ORM, Tailwind + shadcn/ui.

---

## Deployment

Self-host anywhere that runs Node.js with a persistent volume for SQLite.

Included `railway.toml` works out of the box with [Railway](https://railway.app):
- Merge to main → production deploy
- Open PR → ephemeral environment

---

## Docs

- `ARCH.md` — architecture, contracts, security posture
- `VISION.md` — product goals and non-goals
