from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


def _require_python_312() -> None:
    if sys.version_info < (3, 12):
        msg = (
            "gate.py requires Python >= 3.12.\n"
            "Run via uv:\n"
            "  uv run --python 3.12 devtools/gate.py\n"
        )
        raise SystemExit(msg)


@dataclass(frozen=True)
class GateConfig:
    repo_root: Path
    lint: bool
    check: bool
    tests: bool
    build: bool
    bootstrap: bool
    e2e: bool


def _run(cmd: list[str], *, cwd: Path, env: dict[str, str] | None = None) -> None:
    subprocess.run(cmd, cwd=cwd, check=True, env=env)


def _materialize_local_http_projection(repo_root: Path) -> dict[str, str]:
    result = subprocess.run(
        ["node", "--import", "tsx", "tools/local-http-projection.ts"],
        cwd=repo_root,
        check=True,
        stdout=subprocess.PIPE,
        text=True,
    )
    try:
        loaded = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Failed to parse local HTTP projection JSON: {exc}")
    if not isinstance(loaded, dict):
        raise SystemExit("Local HTTP projection did not return an object")

    required = ("PORT", "SEVEN_BASE_URL", "SEVEN_NEXT_DIST_DIR", "SEVEN_PUBLIC_ORIGIN")
    projection: dict[str, str] = {}
    for key in required:
        value = loaded.get(key)
        if not isinstance(value, str) or not value:
            raise SystemExit(f"Local HTTP projection missing {key}")
        projection[key] = value
    return projection


def _build_e2e_env(repo_root: Path) -> dict[str, str]:
    env = os.environ.copy()
    env.update(_materialize_local_http_projection(repo_root))
    env["SEVEN_RENDER_PROOF_DIR"] = str(repo_root / "tmp" / "render-proof")
    env["SEVEN_PLAYWRIGHT_ALLOW_ONLY"] = "0"
    return env


def _expected_render_proof_files() -> list[str]:
    proof_states = [
        "locked",
        "demo-receipt",
        "demo-composer",
        "byok-composer",
        "submitted-workbench",
        "archive",
        "processing-run",
        "completed-answer",
        "how-it-worked",
        "run-details",
        "exports",
        "run-again",
        "failed-recovery",
        "council-editor",
    ]
    expected = [
        f"{viewport}-{state}.png"
        for viewport in ("desktop", "tablet", "mobile")
        for state in proof_states
    ]
    expected.extend(
        f"mobile-{state}-viewport.png"
        for state in (
            "demo-receipt",
            "submitted-workbench",
            "processing-run",
            "completed-answer",
            "how-it-worked",
            "run-details",
            "exports",
            "run-again",
            "failed-recovery",
        )
    )
    expected.append("contact-sheet.jpg")
    expected.append("render-proof-manifest.json")
    return expected


def _check_render_proof_artifacts(*, proof_dir: Path) -> None:
    missing: list[str] = []
    empty: list[str] = []
    for name in _expected_render_proof_files():
        path = proof_dir / name
        if not path.is_file():
            missing.append(name)
            continue
        if path.stat().st_size <= 0:
            empty.append(name)

    if missing or empty:
        details = []
        if missing:
            details.append("missing:\n" + "\n".join(f"- {name}" for name in missing))
        if empty:
            details.append("empty:\n" + "\n".join(f"- {name}" for name in empty))
        raise SystemExit("Rendered proof artifact set is incomplete.\n" + "\n".join(details))

    contact_sheet = proof_dir / "contact-sheet.jpg"
    contact_mtime = contact_sheet.stat().st_mtime_ns
    stale = [
        path.name
        for path in proof_dir.glob("*.png")
        if path.is_file() and path.stat().st_mtime_ns > contact_mtime
    ]
    if stale:
        joined = "\n".join(f"- {name}" for name in sorted(stale))
        raise SystemExit("Rendered proof contact sheet is stale relative to PNG captures:\n" + joined)

    manifest_path = proof_dir / "render-proof-manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text())
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Rendered proof manifest is invalid JSON: {exc}") from exc
    manifest_files = manifest.get("files")
    if not isinstance(manifest_files, list):
        raise SystemExit("Rendered proof manifest must include a files list")
    manifest_names = sorted(
        item.get("name") for item in manifest_files if isinstance(item, dict)
    )
    expected_names = sorted(
        name for name in _expected_render_proof_files() if name != "render-proof-manifest.json"
    )
    if manifest_names != expected_names:
        raise SystemExit("Rendered proof manifest file list does not match expected captures")


def _reset_render_proof_dir(*, proof_dir: Path) -> None:
    if proof_dir.exists():
        shutil.rmtree(proof_dir)
    proof_dir.mkdir(parents=True, exist_ok=True)


def _git_ls_files(*, repo_root: Path) -> list[Path]:
    result = subprocess.run(
        [
            "git",
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
        ],
        cwd=repo_root,
        check=True,
        stdout=subprocess.PIPE,
        text=True,
    )
    files: list[Path] = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        files.append(repo_root / line)
    return files


def _is_owned_source(path: Path, *, repo_root: Path) -> bool:
    rel = path.relative_to(repo_root).as_posix()
    if rel.startswith(
        ("node_modules/", "dist/", ".venv/", ".git/", ".next/", "playwright-report/", "test-results/")
    ):
        return False
    if rel.startswith("packages/db/drizzle/meta/"):
        # Generated by schema tooling; owned schema lives in packages/db/src/schema.ts and packages/db/drizzle.
        return False
    if not path.is_file():
        return False
    # Guardrails are for owned *runtime* artifacts; documentation must not be size/line constrained.
    return path.suffix in {".ts", ".tsx", ".js", ".jsx", ".css", ".py", ".sql", ".json"}


def _check_file_guardrails(*, repo_root: Path) -> None:
    max_lines = 500
    max_bytes = 18_000

    oversized: list[str] = []

    for path in _git_ls_files(repo_root=repo_root):
        if not _is_owned_source(path, repo_root=repo_root):
            continue

        data = path.read_bytes()
        size = len(data)
        lines = data.count(b"\n") + 1
        if lines > max_lines or size > max_bytes:
            rel = path.relative_to(repo_root).as_posix()
            oversized.append(f"{rel} (lines={lines}, bytes={size})")

    if oversized:
        joined = "\n".join(f"- {item}" for item in oversized)
        raise SystemExit(
            "Owned-file guardrails violated (must be <= 500 lines and <= 18kB):\n" + joined
        )


def _check_drizzle_squashed_init(*, repo_root: Path) -> None:
    drizzle_dir = repo_root / "packages" / "db" / "drizzle"
    if not drizzle_dir.is_dir():
        return

    sql_files = sorted(path.name for path in drizzle_dir.glob("*.sql") if path.is_file())
    expected = ["0000_init.sql"]
    if sql_files != expected:
        raise SystemExit(
            "Pre-release DB posture violated: expected a single squashed init migration.\n"
            f"Expected: {expected}\n"
            f"Found: {sql_files}\n"
            "Fix: squash to packages/db/drizzle/0000_init.sql and delete any other packages/db/drizzle/*.sql migrations."
        )

    journal_path = drizzle_dir / "meta" / "_journal.json"
    if not journal_path.is_file():
        raise SystemExit(
            "Missing drizzle journal file (required for deterministic migrations): packages/db/drizzle/meta/_journal.json"
        )

    try:
        journal = json.loads(journal_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Failed to parse drizzle journal JSON: {journal_path.as_posix()} ({exc})")

    entries = journal.get("entries")
    if not isinstance(entries, list):
        raise SystemExit("packages/db/drizzle/meta/_journal.json must contain an 'entries' list")
    if len(entries) != 1 or entries[0].get("tag") != "0000_init":
        raise SystemExit(
            "Pre-release DB posture violated: packages/db/drizzle/meta/_journal.json must contain only the 0000_init entry.\n"
            f"Found entries: {entries}"
        )


def _check_next_env_canonical(*, repo_root: Path) -> None:
    path = repo_root / "apps" / "web" / "next-env.d.ts"
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    if ".next-local/" in text:
        raise SystemExit(
            "Tracked apps/web/next-env.d.ts points at launch-owned .next-local runtime cache.\n"
            "Fix: restore the file to import './.next/types/routes.d.ts'."
        )
    if './.next/types/routes.d.ts' not in text and '"./.next/types/routes.d.ts"' not in text:
        raise SystemExit(
            "Tracked apps/web/next-env.d.ts is missing the canonical .next type reference.\n"
            "Fix: restore the file to import './.next/types/routes.d.ts'."
        )


def _materialize_next_typegen(*, repo_root: Path) -> None:
    _run(["pnpm", "--filter", "@the-seven/web", "exec", "next", "typegen"], cwd=repo_root)


def _check_canonical_surfaces(*, repo_root: Path) -> None:
    conflicting_root_entries = {
        ".env.example": ".env.local.example and .env.live.example own env examples",
        "packages/db/drizzle.config.ts": "hand-owned schema.ts and 0000_init.sql own the launch DB",
        "client": "apps/web owns the browser runtime",
        "server": "apps/web owns the HTTP runtime",
        "shared": "packages/contracts owns shared schemas",
        "config": "packages/config owns runtime configuration",
        "drizzle": "packages/db/drizzle owns launch SQL",
    }
    path_hits = [
        f"{path}: {reason}"
        for path, reason in conflicting_root_entries.items()
        if (repo_root / path).exists()
    ]
    if path_hits:
        joined = "\n".join(f"- {item}" for item in path_hits)
        raise SystemExit("Canonical surface ownership conflict:\n" + joined)

    package_files = [
        path
        for path in _git_ls_files(repo_root=repo_root)
        if path.name == "package.json"
        and not path.relative_to(repo_root).as_posix().startswith(("node_modules/", ".next/"))
    ]
    blocked_dependencies = {
        "@tailwindcss/vite": "Next/Tailwind PostCSS owns the web build",
        "@vitejs/plugin-react": "Next owns the web build",
        "axios": "native fetch owns HTTP transport",
        "esbuild": "Next owns server/browser bundling",
        "express": "Next route handlers own HTTP ingress",
        "prettier": "Biome owns formatting",
        "superjson": "contracts own JSON envelopes",
        "vite": "Next owns the web build",
    }
    dependency_hits: list[str] = []
    for path in package_files:
        try:
            package = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise SystemExit(f"Failed to parse package manifest: {path.as_posix()} ({exc})")
        rel = path.relative_to(repo_root).as_posix()
        for section in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            deps = package.get(section)
            if not isinstance(deps, dict):
                continue
            for name in sorted(blocked_dependencies.keys() & deps.keys()):
                dependency_hits.append(f"{rel}: {section}.{name}: {blocked_dependencies[name]}")

    if dependency_hits:
        joined = "\n".join(f"- {item}" for item in dependency_hits)
        raise SystemExit("Package manifest conflicts with canonical owners:\n" + joined)

    expected_scripts = {
        "package.json": {"dev": "pnpm local:dev"},
        "apps/web/package.json": {"dev": "node --import tsx ../../tools/next-dev-server.ts"},
    }
    script_hits: list[str] = []
    for rel, scripts in expected_scripts.items():
        path = repo_root / rel
        if not path.exists():
            continue
        try:
            package = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise SystemExit(f"Failed to parse package manifest: {path.as_posix()} ({exc})")
        manifest_scripts = package.get("scripts")
        if not isinstance(manifest_scripts, dict):
            script_hits.append(f"{rel}: missing scripts")
            continue
        for name, expected in scripts.items():
            actual = manifest_scripts.get(name)
            if actual != expected:
                script_hits.append(f"{rel}: scripts.{name}: expected {expected!r}, found {actual!r}")

    if script_hits:
        joined = "\n".join(f"- {item}" for item in script_hits)
        raise SystemExit("Local launch script ownership conflict:\n" + joined)

    exact_active_token_checks = {
        "apps/web/e2e/smoke.spec.ts": ["seven.demo.token", "SEVEN_PLAYWRIGHT_DEMO_TOKEN"],
        "tools/live-test.ts": ["SEVEN_SKIP_DEMO_LIVE"],
        ".env.local.example": ["SEVEN_PLAYWRIGHT_DEMO_TOKEN"],
        ".env.live.example": ["SEVEN_PLAYWRIGHT_DEMO_TOKEN"],
    }
    hazard_hits: list[str] = []
    for rel, hazards in exact_active_token_checks.items():
        path = repo_root / rel
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for hazard in hazards:
            if hazard in text:
                hazard_hits.append(f"{rel}: {hazard}")

    if hazard_hits:
        joined = "\n".join(f"- {item}" for item in hazard_hits)
        raise SystemExit("Exact active contract token drift:\n" + joined)


def main(argv: list[str]) -> int:
    _require_python_312()

    parser = argparse.ArgumentParser()
    parser.add_argument("--no-lint", action="store_true", help="Skip Biome lint/format checks")
    parser.add_argument("--no-check", action="store_true", help="Skip TypeScript typecheck")
    parser.add_argument("--no-tests", action="store_true", help="Skip tests")
    parser.add_argument("--no-build", action="store_true", help="Skip production build")
    parser.add_argument("--no-bootstrap", action="store_true", help="Skip isolated database bootstrap verification")
    parser.add_argument("--full", action="store_true", help="Include Playwright browser coverage")
    args = parser.parse_args(argv)

    repo_root = Path(__file__).resolve().parent.parent

    os.environ.setdefault("CI", "1")

    config = GateConfig(
        repo_root=repo_root,
        lint=not args.no_lint,
        check=not args.no_check,
        tests=not args.no_tests,
        build=not args.no_build,
        bootstrap=not args.no_bootstrap,
        e2e=args.full,
    )

    _check_file_guardrails(repo_root=config.repo_root)
    _check_drizzle_squashed_init(repo_root=config.repo_root)
    _check_next_env_canonical(repo_root=config.repo_root)
    _check_canonical_surfaces(repo_root=config.repo_root)

    if config.lint:
        _run(["pnpm", "run", "lint"], cwd=config.repo_root)
    if config.check:
        _materialize_next_typegen(repo_root=config.repo_root)
        _check_next_env_canonical(repo_root=config.repo_root)
        _run(["pnpm", "run", "check"], cwd=config.repo_root)
    if config.tests:
        _run(["pnpm", "test"], cwd=config.repo_root)
    if config.build:
        _run(["pnpm", "run", "build"], cwd=config.repo_root)
    if config.bootstrap:
        _run(["pnpm", "run", "db:bootstrap:check"], cwd=config.repo_root)
    if config.e2e:
        e2e_env = _build_e2e_env(config.repo_root)
        _reset_render_proof_dir(proof_dir=Path(e2e_env["SEVEN_RENDER_PROOF_DIR"]))
        _run(["pnpm", "run", "test:e2e"], cwd=config.repo_root, env=e2e_env)
        _check_render_proof_artifacts(proof_dir=Path(e2e_env["SEVEN_RENDER_PROOF_DIR"]))

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
