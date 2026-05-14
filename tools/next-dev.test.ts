import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  removeLocalDistDir,
  requireProjectedNextDevPort,
  requireProjectedNextDistDir,
  resolveNextDevRepoRoot,
  restoreNextEnvIfOwned,
} from "./next-dev";

const tempRoots: string[] = [];

function projectedEnv(input: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...input };
}

function makeRepoRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "the-seven-next-dev-"));
  tempRoots.push(root);
  mkdirSync(path.join(root, "apps", "web"), { recursive: true });
  return root;
}

describe("launch-owned Next dev helpers", () => {
  afterEach(() => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
        rmSync(root, { force: true, recursive: true });
      }
    }
  });

  test("requires projected port and distDir values", () => {
    expect(requireProjectedNextDevPort(projectedEnv({ PORT: "43217" }))).toBe(43_217);
    expect(
      requireProjectedNextDistDir(projectedEnv({ SEVEN_NEXT_DIST_DIR: ".next-local/43217" })),
    ).toBe(".next-local/43217");
    expect(() => requireProjectedNextDevPort(projectedEnv({ PORT: "03000" }))).toThrow(
      "PORT must be a decimal TCP port",
    );
    expect(() =>
      requireProjectedNextDistDir(projectedEnv({ SEVEN_NEXT_DIST_DIR: ".next/dev" })),
    ).toThrow("SEVEN_NEXT_DIST_DIR must be a launch-owned .next-local/<port> path.");
  });

  test("restores next-env when Next rewrites it for the projected distDir", () => {
    const repoRoot = makeRepoRoot();
    const filePath = path.join(repoRoot, "apps", "web", "next-env.d.ts");
    writeFileSync(filePath, "before\n", "utf8");

    writeFileSync(
      filePath,
      '/// <reference types="./.next-local/43217/types/routes.d.ts" />\n',
      "utf8",
    );
    restoreNextEnvIfOwned({
      repoRoot,
      before: "before\n",
      distDir: ".next-local/43217",
    });

    expect(readFileSync(filePath, "utf8")).toBe("before\n");
  });

  test("removes only launch-owned local distDirs", async () => {
    const repoRoot = makeRepoRoot();
    const distPath = path.join(repoRoot, "apps", "web", ".next-local", "43217");
    mkdirSync(distPath, { recursive: true });
    writeFileSync(path.join(distPath, "marker"), "x", "utf8");

    await removeLocalDistDir({ repoRoot, distDir: ".next-local/43217" });

    expect(existsSync(distPath)).toBe(false);
    await expect(removeLocalDistDir({ repoRoot, distDir: "../.next" })).rejects.toThrow(
      "Refusing to remove a Next distDir outside .next-local.",
    );
  });

  test("resolves the repo root from a package-local working directory", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(path.join(repoRoot, "pnpm-workspace.yaml"), "packages: []\n", "utf8");

    expect(resolveNextDevRepoRoot(path.join(repoRoot, "apps", "web"))).toBe(repoRoot);
  });
});
