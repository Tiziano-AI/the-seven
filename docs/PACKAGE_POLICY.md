# Package Policy

The rewrite keeps one modern, coherent toolchain. New packages require a stronger case than composing the existing stack.

## Canonical Packages

- App runtime: `next`, `react`, `react-dom`
- UI: `tailwindcss`, `@tailwindcss/postcss`, `class-variance-authority`,
  `clsx`, `tailwind-merge`, local tokenized components aligned with
  `components.json`, `sonner`
- State and validation: `zod`
- Database: `drizzle-orm`, `pg`
- Tooling: `@biomejs/biome`, `typescript`, `tsx`, `vitest`, `playwright`
- Content rendering: `react-markdown`, `remark-gfm`
- Attachment parsing: `file-type`, `officeparser`
- Server-component guards: `server-only`

## Package Rules

- Prefer framework-native behavior before adding a helper package.
- Prefer native `fetch` before adding HTTP client wrappers.
- Prefer local composition over adding component libraries beyond the rendered component surface already owned in `apps/web/src/components`.
- Prefer one package owner per concern.
- Remove packages immediately when their last rendered/runtime usage disappears.

## Package Admission Boundaries

- Server HTTP ingress stays on Next route handlers.
- Web bundling stays on the Next toolchain.
- Formatting and linting stay on Biome.
- Rendered UI primitives stay in `apps/web/src/components`.
- HTTP transport stays on native `fetch`.
- Attachment MIME sniffing stays on `file-type`; document text extraction stays
  on `officeparser`.
- Server-only module boundaries stay explicit through `server-only` imports.

## Workspace Rules

- `apps/web` and `apps/cli` may depend on `packages/contracts`, `packages/config`, and `packages/db`.
- `packages/contracts` must not depend on `next`.
- `packages/config` must not depend on `next`.
- `packages/db` may depend on `packages/contracts` and `packages/config`, but not on `apps/*`.

## Dependency Hygiene

- root scripts run through `pnpm` only
- all formatting and linting run through Biome only
- all package versions are pinned explicitly in workspace manifests
- optional peer installation is not relied upon for runtime correctness
