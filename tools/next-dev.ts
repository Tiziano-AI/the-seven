import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sleep } from "./process-utils";

export interface NextDevCommand {
  /** Executable used for launch-owned Next dev server wrappers. */
  readonly command: string;
  /** Arguments passed to the wrapper executable without shell interpolation. */
  readonly args: readonly string[];
}

const nextDistPattern = /^\.next-local\/[1-9]\d*$/;

function repoWebRoot(repoRoot: string): string {
  return path.join(repoRoot, "apps", "web");
}

function nextEnvPath(repoRoot: string): string {
  return path.join(repoWebRoot(repoRoot), "next-env.d.ts");
}

function requireProjectedPort(env: NodeJS.ProcessEnv): number {
  const rawPort = env.PORT?.trim();
  if (!rawPort) {
    throw new Error("PORT is required for the launch-owned Next dev server.");
  }
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535 || String(port) !== rawPort) {
    throw new Error("PORT must be a decimal TCP port for the launch-owned Next dev server.");
  }
  return port;
}

function requireProjectedDistDir(env: NodeJS.ProcessEnv): string {
  const distDir = env.SEVEN_NEXT_DIST_DIR?.trim();
  if (!distDir || !nextDistPattern.test(distDir)) {
    throw new Error("SEVEN_NEXT_DIST_DIR must be a launch-owned .next-local/<port> path.");
  }
  return distDir;
}

function readTextIfPresent(filePath: string): string | null {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
}

function restoreNextEnvIfOwned(input: {
  repoRoot: string;
  before: string | null;
  distDir: string;
}): void {
  const filePath = nextEnvPath(input.repoRoot);
  const current = readTextIfPresent(filePath);
  if (current === input.before || current === null || !current.includes(input.distDir)) {
    return;
  }
  if (input.before === null) {
    rmSync(filePath, { force: true });
    return;
  }
  writeFileSync(filePath, input.before, "utf8");
}

async function removeLocalDistDir(input: { repoRoot: string; distDir: string }): Promise<void> {
  const webRoot = repoWebRoot(input.repoRoot);
  const distPath = path.resolve(webRoot, input.distDir);
  const allowedRoot = path.resolve(webRoot, ".next-local");
  if (!distPath.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error("Refusing to remove a Next distDir outside .next-local.");
  }
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(distPath, { force: true, recursive: true });
      if (existsSync(allowedRoot) && readdirSync(allowedRoot).length === 0) {
        rmdirSync(allowedRoot);
      }
      return;
    } catch (error: unknown) {
      lastError = error;
      await sleep(250);
    }
  }
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(`Failed to remove isolated Next distDir ${distPath}.`);
}

function waitForChild(input: { child: ChildProcess }): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    input.child.on("error", reject);
    input.child.on("close", (code, signal) => {
      if (code === 0 || signal === "SIGTERM" || signal === "SIGINT") {
        resolve();
        return;
      }
      reject(new Error(`Next dev server exited with code ${code ?? signal ?? "unknown"}.`));
    });
  });
}

function signalChildTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.exitCode !== null || !child.pid) {
    return;
  }
  if (process.platform === "win32") {
    child.kill(signal);
    return;
  }
  process.kill(-child.pid, signal);
}

/** Builds the one command used by local and browser-proof Next dev launches. */
export function buildNextDevServerCommand(): NextDevCommand {
  return {
    command: "node",
    args: ["--import", "tsx", "tools/next-dev-server.ts"],
  };
}

/** Runs Next dev with isolated distDir ownership and restores generated files on exit. */
export async function runProjectedNextDevServer(input: {
  repoRoot: string;
  env: NodeJS.ProcessEnv;
}): Promise<void> {
  const port = requireProjectedPort(input.env);
  const distDir = requireProjectedDistDir(input.env);
  const beforeNextEnv = readTextIfPresent(nextEnvPath(input.repoRoot));
  const child = spawn(
    "pnpm",
    [
      "--filter",
      "@the-seven/web",
      "exec",
      "next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: input.repoRoot,
      detached: process.platform !== "win32",
      env: input.env,
      stdio: "inherit",
    },
  );

  const stop = () => {
    signalChildTree(child, "SIGTERM");
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    await waitForChild({ child });
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    restoreNextEnvIfOwned({ repoRoot: input.repoRoot, before: beforeNextEnv, distDir });
    await removeLocalDistDir({ repoRoot: input.repoRoot, distDir });
  }
}
