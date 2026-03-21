# Retirement Manifest

Everything listed here is retired in the rewrite and must be deleted in the same change set as its replacement.

## Directories

- `client/`
- `server/`
- `shared/`
- `config/`
- legacy `drizzle/` contents once replaced by the new `packages/db` schema and init migration

## Runtime Paths

- Express bootstrap and middleware chain
- Vite dev server integration
- hand-rolled browser router
- empty `trpc` surface
- runtime JSON config file loading
- fire-and-forget orchestration entrypoints
- separate response/review/synthesis persistence paths
- any duplicate ask/run inspector composition paths

## Dependencies

- `express`
- `axios`
- `prettier`
- `esbuild`
- `@vitejs/plugin-react`
- `vite`
- `@tailwindcss/vite`
- `superjson`
- any Radix or shadcn dependency whose wrapper is not rendered by the rewritten app
- any package that exists only to support a retired wrapper or retired runtime path

## Symbols and Terms

- `/journal`
- `/council`
- `/session/:id`
- unversioned `/api/*`
- `member responses` / `member reviews` / `member synthesis` as separate persistence owners

## Validation Rule

Delivery is incomplete until repository search shows no remaining imports, references, scripts, docs, or tests that point at retired paths, packages, or route names.
