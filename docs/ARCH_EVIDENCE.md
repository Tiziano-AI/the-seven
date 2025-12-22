# Architecture Evidence (Appendix)

This file is the evidence appendix for `ARCH.md`.

## Evidence (External)

- OpenRouter endpoints used by this service:
  - `GET /api/v1/auth/key` (key validation)
    - Evidence: `vendor:openrouter:2025-12-15:https://openrouter.ai/api/v1/auth/key`
    - Evidence: `vendor:openrouter:2025-12-17:https://openrouter.ai/docs/api-reference/authentication`
  - `POST /api/v1/chat/completions` (chat completions; non-stream in current runtime)
    - Evidence: `vendor:openrouter:2025-12-17:https://openrouter.ai/docs/api-reference/chat-completion`
    - Evidence: `vendor:openrouter:2025-12-18:https://openrouter.ai/docs/api-reference/parameters`
    - Evidence: `vendor:openrouter:2025-12-17:https://openrouter.ai/docs/features/tool-calling`
    - Evidence: `vendor:openrouter:2025-12-17:https://openrouter.ai/docs/features/provider-routing`
    - Evidence: `vendor:openrouter:2025-12-18:https://openrouter.ai/docs/features/reasoning-tokens`
    - Evidence: `vendor:openrouter:2025-12-19:https://openrouter.ai/docs/guides/features/message-transforms`
    - Evidence: `vendor:openrouter:2025-12-19:https://openrouter.ai/docs/guides/features/plugins`
  - `GET /api/v1/models` (catalog + pricing)
    - Evidence: `vendor:openrouter:2025-12-15:https://openrouter.ai/api/v1/models`
    - Evidence: `vendor:openrouter:2025-12-17:https://openrouter.ai/docs/api-reference/models`
    - Note: `/api/v1/models` includes model metadata (`id`, `name`, `description`, `supported_parameters`, `default_parameters`, `top_provider.max_completion_tokens`, `architecture.*`, etc.) plus pricing fields (`pricing.prompt`, `pricing.completion`, etc.).
    - Evidence: `vendor:openrouter:2025-12-19:https://openrouter.ai/docs/api-reference/models` (pricing values are defined per token/request/unit in USD)
  - `GET /api/v1/generation` (billing + native token stats for a generation id)
    - Evidence: `vendor:openrouter:2025-12-19:https://openrouter.ai/docs/api-reference/generation`
    - Note: response wraps generation details under `data` with fields like `id`, `model`, `total_cost`, `native_tokens_*`.
  - Response semantics (model routing + usage token caveats)
    - Evidence: `vendor:openrouter:2025-12-19:https://openrouter.ai/docs/api-reference/overview` (response `model` may differ; usage tokens are normalized; exact cost via generation endpoint)
  - `GET /api/v1/models/:author/:slug/endpoints` (model endpoints + supported parameters per endpoint)
    - Evidence: `vendor:openrouter:2025-12-17:https://openrouter.ai/docs/api-reference/list-endpoints-for-a-model`

- Resend email delivery (demo magic-link):
  - `POST /emails` (send email; required `from`, `to`, `subject`; idempotency header)
    - Evidence: `vendor:resend:2025-12-21:https://resend.com/docs/api-reference/emails/send-email`
  - Idempotency keys for `POST /emails` (24h retention, header usage)
    - Evidence: `vendor:resend:2025-12-21:https://resend.com/docs/dashboard/emails/idempotency-keys`
  - Rate limits (default 2 req/sec + ratelimit headers, 429 on exceed)
    - Evidence: `vendor:resend:2025-12-21:https://resend.com/docs/api-reference/rate-limit`
  - Domain verification (SPF + DKIM required; subdomain recommendation)
    - Evidence: `vendor:resend:2025-12-21:https://resend.com/docs/dashboard/domains/introduction`

- Cloudflare origin IP (abuse controls):
  - `CF-Connecting-IP` header includes the client IP at the origin.
    - Evidence: `vendor:cloudflare:2025-12-21:https://developers.cloudflare.com/fundamentals/reference/http-headers/`

## Evidence (Local Runtime)

- `dotenv/config` wires into dotenv’s `.env` loader (so `import "dotenv/config"` is sufficient to load `.env` into `process.env`).
  - Evidence: `node_modules:dotenv/config.js:1`
  - Evidence: `node_modules:dotenv/lib/main.js:251`

- Drizzle’s better-sqlite3 driver is the canonical sync driver used for SQLite access.
  - Evidence: `node_modules:drizzle-orm/better-sqlite3/driver.js:1-56`

- Drizzle SQLite timestamp default expression uses `julianday('now')` and millisecond conversion.
  - Evidence: `node_modules:drizzle-orm/sqlite-core/columns/integer.js:41-54`

- Drizzle SQLite insert supports `returning()` and conflict clauses (used for idempotent inserts/upserts).
  - Evidence: `node_modules:drizzle-orm/sqlite-core/query-builders/insert.js:53-134`

- `officeparser` supports Office + PDF text extraction (used for attachments ingestion).
  - Evidence: `node_modules:officeparser/package.json:4`

- `file-type` provides robust binary type detection (used for attachments ingestion).
  - Evidence: `node_modules:file-type/package.json:3`

- `react-resizable-panels` exports `Group`, `Panel`, and `Separator` (no `PanelGroup`/`PanelResizeHandle`).
  - Evidence: `node_modules:react-resizable-panels/dist/react-resizable-panels.d.ts:22`
  - Evidence: `node_modules:react-resizable-panels/dist/react-resizable-panels.d.ts:152`
  - Evidence: `node_modules:react-resizable-panels/dist/react-resizable-panels.d.ts:292`

- `sonner` exposes the `toast` function with `success`/`error`/`message` helpers (used for UI feedback).
  - Evidence: `node_modules:sonner/dist/index.d.ts:130-152`

- `@radix-ui/react-tooltip` exports `Root`, `Trigger`, and `Content` primitives (wrapped by our tooltip UI).
  - Evidence: `node_modules:@radix-ui/react-tooltip/dist/index.d.ts:101`

- `@radix-ui/react-collapsible` exports `Collapsible`, `CollapsibleTrigger`, and `CollapsibleContent` (used for row and diagnostics disclosure).
  - Evidence: `node_modules:@radix-ui/react-collapsible/dist/index.d.ts:5-33`

- `@radix-ui/react-dialog` exports `Dialog`, `DialogTrigger`, and `DialogContent` primitives (used for export/rerun dialogs).
  - Evidence: `node_modules:@radix-ui/react-dialog/dist/index.d.ts:8-103`

- `@radix-ui/react-select` exports `Select`, `SelectTrigger`, `SelectContent`, and `SelectItem` primitives (used for council selection and tuning presets).
  - Evidence: `node_modules:@radix-ui/react-select/dist/index.d.ts:10-137`
