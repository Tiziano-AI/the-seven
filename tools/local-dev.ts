import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { serverRuntime } from "@the-seven/config";
import {
  checkEnvFileMode,
  checkEnvFilePresence,
  checkEnvProfile,
  checkLegacyEnvRuntimeKeys,
  readEnvAssignments,
} from "./env-doctor";
import { buildLocalGateCommand } from "./gate-command";
import { readLocalDatabaseSchemaState, toLocalDatabaseSchemaCheck } from "./local-db-schema";
import { materializeLocalHttpProjection } from "./local-http";
import { buildLocalOperatorEnv } from "./local-operator-env";
import {
  ensureComposePostgresHealthy,
  type OperatorCheckResult,
  readCanonicalLocalPostgresStatus,
  toCanonicalLocalPostgresCheck,
  waitForComposePostgresHealthy,
} from "./local-postgres";
import { assertNoSiblingLocalWorkers } from "./local-processes";
import { buildNextDevServerCommand } from "./next-dev";
import { runCommand, runCommandOrThrow, sleep, stopChild } from "./process-utils";

const repoRoot = process.cwd();
const composeFilePath = path.join(repoRoot, "compose.yaml");
const envLocalPath = path.join(repoRoot, ".env.local");
const envLegacyPath = path.join(repoRoot, ".env");
const healthcheckTimeoutMs = 60_000;
const appReadyTimeoutMs = 120_000;
const brewFormulae = ["libpq", "uv", "node", "pnpm"] as const;
const brewCasks = ["docker"] as const;

function localOperatorEnv() {
  return buildLocalOperatorEnv({
    assignments: readEnvAssignments(envLocalPath),
    env: process.env,
  });
}

function buildComposeArgs(args: ReadonlyArray<string>) {
  return ["compose", "-f", composeFilePath, ...args];
}

function formatCheck(result: OperatorCheckResult) {
  return `${result.ok ? "PASS" : "FAIL"} ${result.label}: ${result.detail}`;
}

function parseMajorVersion(input: string) {
  const match = input.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function ensureEnvLocalExists() {
  if (existsSync(envLocalPath)) {
    return;
  }
  const legacyHint = existsSync(envLegacyPath)
    ? " Legacy `.env` exists; move its keys into `.env.local`."
    : "";
  throw new Error(`Missing .env.local.${legacyHint}`);
}
async function commandExists(command: string) {
  const result = await runCommand("which", [command]);
  return result.code === 0;
}

async function checkCommand(command: string, versionArgs: ReadonlyArray<string>, label: string) {
  if (!(await commandExists(command))) {
    return {
      label,
      ok: false,
      detail: `${command} is not on PATH`,
      fix: `Run \`pnpm local:bootstrap -- --install\` to install ${command}.`,
    } satisfies OperatorCheckResult;
  }

  const result = await runCommand(command, versionArgs);
  return {
    label,
    ok: result.code === 0,
    detail: result.stdout || result.stderr || `${command} is available`,
    fix:
      result.code === 0 ? null : `Run \`pnpm local:bootstrap -- --install\` to repair ${command}.`,
  } satisfies OperatorCheckResult;
}

async function checkNodeVersion() {
  const major = parseMajorVersion(process.version);
  return {
    label: "node",
    ok: typeof major === "number" && major >= 22,
    detail: process.version,
    fix: typeof major === "number" && major >= 22 ? null : "Install Node 22+ with Homebrew.",
  } satisfies OperatorCheckResult;
}

async function checkDocker() {
  if (!(await commandExists("docker"))) {
    return {
      label: "docker",
      ok: false,
      detail: "docker is not on PATH",
      fix: "Install Docker Desktop or run `pnpm local:bootstrap -- --install`.",
    } satisfies OperatorCheckResult;
  }

  const info = await runCommand("docker", ["info"]);
  if (info.code !== 0) {
    return {
      label: "docker",
      ok: false,
      detail: info.stderr || "Docker daemon is unavailable",
      fix: "Start Docker Desktop and rerun the command.",
    } satisfies OperatorCheckResult;
  }

  const compose = await runCommand("docker", ["compose", "version"]);
  return {
    label: "docker compose",
    ok: compose.code === 0,
    detail: compose.stdout || compose.stderr || "docker compose is available",
    fix:
      compose.code === 0
        ? null
        : "Install Docker Desktop with Compose support or run `pnpm local:bootstrap -- --install`.",
  } satisfies OperatorCheckResult;
}

async function checkPlaywrightBrowser() {
  try {
    const executablePath = chromium.executablePath();
    if (!existsSync(executablePath)) {
      return {
        label: "playwright browser",
        ok: false,
        detail: `Chromium is missing at ${executablePath}`,
        fix: "Run `pnpm exec playwright install chromium` or `pnpm local:bootstrap -- --install`.",
      } satisfies OperatorCheckResult;
    }

    return {
      label: "playwright browser",
      ok: true,
      detail: executablePath,
      fix: null,
    } satisfies OperatorCheckResult;
  } catch (error) {
    return {
      label: "playwright browser",
      ok: false,
      detail: error instanceof Error ? error.message : "Chromium is unavailable",
      fix: "Run `pnpm exec playwright install chromium` or `pnpm local:bootstrap -- --install`.",
    } satisfies OperatorCheckResult;
  }
}

async function collectDoctorChecks(live: boolean) {
  const databaseStatus = readEnvAssignments(envLocalPath).get("DATABASE_URL");
  const localPostgresStatus =
    typeof databaseStatus === "string" && databaseStatus.trim().length > 0
      ? await readCanonicalLocalPostgresStatus({
          composeFilePath,
          connectionString: databaseStatus,
        })
      : null;
  const localPostgresCheck =
    localPostgresStatus !== null
      ? toCanonicalLocalPostgresCheck(localPostgresStatus)
      : ({
          label: "local postgres port",
          ok: false,
          detail: "DATABASE_URL is missing from .env.local",
          fix: "Set DATABASE_URL in `.env.local` before running local commands.",
        } satisfies OperatorCheckResult);
  const localSchemaCheck =
    typeof databaseStatus === "string" &&
    databaseStatus.trim().length > 0 &&
    localPostgresCheck.ok &&
    localPostgresStatus?.composeHealth === "healthy"
      ? toLocalDatabaseSchemaCheck(await readLocalDatabaseSchemaState(databaseStatus))
      : ({
          label: "local postgres schema",
          ok: true,
          detail: "not checked until compose Postgres is healthy",
          fix: null,
        } satisfies OperatorCheckResult);

  return [
    await checkCommand("brew", ["--version"], "brew"),
    await checkDocker(),
    await checkNodeVersion(),
    await checkCommand("pnpm", ["--version"], "pnpm"),
    await checkCommand("uv", ["--version"], "uv"),
    await checkCommand("psql", ["--version"], "psql"),
    await checkCommand("pg_isready", ["--version"], "pg_isready"),
    await checkPlaywrightBrowser(),
    localPostgresCheck,
    localSchemaCheck,
    checkEnvFilePresence({ envLocalPath, envLegacyPath }),
    checkEnvFileMode(envLocalPath),
    checkLegacyEnvRuntimeKeys(envLegacyPath),
    checkEnvProfile({ envLocalPath, live }),
  ] satisfies ReadonlyArray<OperatorCheckResult>;
}

async function runDoctor(showFixes: boolean, live = false) {
  const checks = await collectDoctorChecks(live);
  for (const result of checks) {
    console.log(formatCheck(result));
  }

  const failures = checks.filter((result) => !result.ok);
  if (showFixes && failures.length > 0) {
    console.log("");
    console.log("Suggested fixes:");
    for (const result of failures) {
      if (result.fix) {
        console.log(`- ${result.fix}`);
      }
    }
  }

  return failures.length === 0;
}

async function ensureDockerReady() {
  const dockerCheck = await checkDocker();
  if (!dockerCheck.ok) {
    throw new Error(dockerCheck.detail);
  }
}

async function waitForComposeHealth() {
  const env = localOperatorEnv();
  await waitForComposePostgresHealthy({
    composeFilePath,
    connectionString: serverRuntime(env).databaseUrl,
    healthcheckTimeoutMs,
    sleep,
  });
}

async function ensureComposeDbHealthy() {
  const env = localOperatorEnv();
  await ensureComposePostgresHealthy({
    composeFilePath,
    connectionString: serverRuntime(env).databaseUrl,
  });
  await ensureLocalDatabaseSchemaCompatible(serverRuntime(env).databaseUrl);
}

async function ensureLocalDatabaseSchemaCompatible(connectionString: string) {
  const check = toLocalDatabaseSchemaCheck(await readLocalDatabaseSchemaState(connectionString));
  if (!check.ok) {
    throw new Error(`${check.detail}; ${check.fix}`);
  }
}

async function waitForHttpReady(baseUrl: string) {
  const deadline = Date.now() + appReadyTimeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch {}
    await sleep(1_000);
  }

  throw new Error(`App did not become ready at ${baseUrl} within ${appReadyTimeoutMs / 1000}s.`);
}

async function stopChildProcess(child: ChildProcess) {
  await stopChild(child);
}

async function installPrerequisites() {
  if (!(await commandExists("brew"))) {
    throw new Error("Homebrew is required for `pnpm local:bootstrap -- --install`.");
  }

  const brewfileLines: string[] = [];
  for (const formula of brewFormulae) {
    const installed = await runCommand("brew", ["list", "--formula", formula]);
    if (installed.code !== 0) {
      brewfileLines.push(`brew "${formula}"`);
    }
  }
  for (const cask of brewCasks) {
    const installed = await runCommand("brew", ["list", "--cask", cask]);
    if (installed.code !== 0 && !(await commandExists(cask))) {
      brewfileLines.push(`cask "${cask}"`);
    }
  }

  if (brewfileLines.length > 0) {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "the-seven-brew-"));
    const tempBrewfile = path.join(tempDirectory, "Brewfile");
    writeFileSync(tempBrewfile, `${brewfileLines.join("\n")}\n`, "utf8");
    try {
      await runCommandOrThrow("brew", ["bundle", "--file", tempBrewfile], {
        env: {
          ...process.env,
          HOMEBREW_NO_AUTO_UPDATE: "1",
        },
      });
    } finally {
      rmSync(tempDirectory, { force: true, recursive: true });
    }
  }

  if (!(await commandExists("psql")) || !(await commandExists("pg_isready"))) {
    await runCommandOrThrow("brew", ["link", "--overwrite", "--force", "libpq"]);
  }

  const playwrightBrowser = await checkPlaywrightBrowser();
  if (!playwrightBrowser.ok) {
    await runCommandOrThrow("pnpm", ["exec", "playwright", "install", "chromium"]);
  }
}

async function runDbUp() {
  await ensureDockerReady();
  const env = localOperatorEnv();
  const diagnosis = await readCanonicalLocalPostgresStatus({
    composeFilePath,
    connectionString: serverRuntime(env).databaseUrl,
  });
  const portCheck = toCanonicalLocalPostgresCheck(diagnosis);
  if (!portCheck.ok) {
    throw new Error(`${portCheck.detail}; ${portCheck.fix}`);
  }
  await runCommandOrThrow("docker", buildComposeArgs(["up", "-d", "postgres"]));
  await waitForComposeHealth();
  await ensureLocalDatabaseSchemaCompatible(serverRuntime(env).databaseUrl);
  console.log("Postgres is healthy on 127.0.0.1:5432.");
}

async function runDbDown() {
  await ensureDockerReady();
  await runCommandOrThrow("docker", buildComposeArgs(["down", "--remove-orphans"]));
  console.log("Compose services stopped.");
}

async function runDbReset() {
  await ensureDockerReady();
  await runCommandOrThrow("docker", buildComposeArgs(["down", "--volumes", "--remove-orphans"]));
  await runDbUp();
}

async function runDev() {
  ensureEnvLocalExists();
  await ensureComposeDbHealthy();
  const projection = await materializeLocalHttpProjection(localOperatorEnv());
  const app = buildNextDevServerCommand();
  console.log(`Local app: ${projection.baseUrl}`);
  await runCommandOrThrow(app.command, app.args, {
    env: projection.env,
    stdio: "inherit",
  });
}

async function runGate(args: readonly string[]) {
  ensureEnvLocalExists();
  await ensureComposeDbHealthy();
  const gate = buildLocalGateCommand(args);
  await runCommandOrThrow(gate.command, gate.args, {
    env: process.env,
    stdio: "inherit",
  });
}

async function runLive() {
  ensureEnvLocalExists();
  const doctorOk = await runDoctor(false, true);
  if (!doctorOk) {
    throw new Error("Live proof environment is not ready. Run `pnpm local:doctor --live`.");
  }
  await assertNoSiblingLocalWorkers({ repoRoot, currentPid: process.pid });
  await runDbUp();

  const projection = await materializeLocalHttpProjection(localOperatorEnv());
  const baseUrl = projection.baseUrl;
  const app = buildNextDevServerCommand();
  console.log(`Live proof app: ${projection.baseUrl}`);
  const child = spawn(app.command, app.args, {
    cwd: repoRoot,
    env: projection.env,
    stdio: "inherit",
  });

  try {
    await waitForHttpReady(baseUrl);
    await runCommandOrThrow("pnpm", ["test:live"], {
      env: {
        ...projection.env,
        SEVEN_PLAYWRIGHT_EXTERNAL_SERVER: "1",
      },
      stdio: "inherit",
    });
  } finally {
    await stopChildProcess(child);
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === "doctor") {
    process.exitCode = (await runDoctor(false, args.includes("--live"))) ? 0 : 1;
    return;
  }

  if (command === "bootstrap") {
    if (args.includes("--install")) {
      await installPrerequisites();
    }
    process.exitCode = (await runDoctor(true, args.includes("--live"))) ? 0 : 1;
    return;
  }

  if (command === "db:up") {
    await runDbUp();
    return;
  }

  if (command === "db:down") {
    await runDbDown();
    return;
  }

  if (command === "db:reset") {
    await runDbReset();
    return;
  }

  if (command === "dev") {
    await runDev();
    return;
  }

  if (command === "gate") {
    await runGate(args);
    return;
  }

  if (command === "live") {
    await runLive();
    return;
  }

  throw new Error(
    "Unknown command. Use one of: doctor, bootstrap, db:up, db:down, db:reset, dev, gate, live.",
  );
}

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
