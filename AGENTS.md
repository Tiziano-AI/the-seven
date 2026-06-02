# AGENTS.md — local operator notes for the-seven

This file is gitignored and stays local. Public-facing docs are `README.md`,
`VISION.md`, `ARCH.md`, and the `docs/` directory.

## Personal secrets workflow

- `~/.secrets/ALL.env` is the human-owned master secret pool.
- `THE_SEVEN__...` keys materialize into `~/.secrets/the-seven.env`.
- `.env.local` is the repo-local symlink to the app slice.
- `pnpm local:*` is the only canonical local operator surface.

Materialize the runtime slice with:

```bash
tiz-home --json secrets doctor   # validate without printing values
tiz-home --json secrets sync     # dry-run plan
tiz-home --json secrets sync --apply
```

Then:

```bash
ln -sfn ~/.secrets/the-seven.env .env.local
```

## Live-proof blocked convention

When live keys are absent, `pnpm local:live` proof is recorded as `[blocked]`
in `HANDOFF.md` with the exact missing keys listed.

## Document map

- `VISION.md` — product outcomes and non-goals
- `ARCH.md` — canonical architecture, contracts, citations, owner maps
- `README.md` — operator and contributor guide
- `docs/BOUNDARY_REPLACEMENT_MAP.md` — old-to-new surface map
- `docs/CANONICAL_SURFACES.md` — launch surface owners and gate boundary
- `docs/PACKAGE_POLICY.md` — package and workspace rules
- `docs/VALIDATION_MATRIX.md` — verification requirements
- `PLAN.md`, `HANDOFF.md`, `CONTINUE.md` — active workflow state when work is in flight (gitignored)
