import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { loadCliEnv, loadServerEnv } from "@the-seven/config";
import { runCommand, runCommandOrThrow, sleep, stopChild } from "./process-utils";

type CheckResult = Readonly<{
  label: string;
  ok: boolean;
  detail: string;
  fix: string | null;
}>;

const repoRoot = process.cwd();
const composeFilePath = path.join(repoRoot, "compose.yaml");
const envLocalPath = path.join(repoRoot, ".env.local");
const envLegacyPath = path.join(repoRoot, ".env");
const healthcheckTimeoutMs = 60_000;
const appReadyTimeoutMs = 120_000;
const brewFormulae = ["libpq", "cloudflared", "uv", "node", "pnpm"] as const;
const brewCasks = ["docker"] as const;
function buildComposeArgs(args: ReadonlyArray<string>) {
  return ["compose", "-f", composeFilePath, ...args];
}
function readEnvAssignments(filePath: string) {
  if (!existsSync(filePath)) {
    return new Map<string, string>();
  }
  return new Map(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}
function formatCheck(result: CheckResult) {
  return `${result.ok ? "PASS" : "FAIL"} ${result.label}: ${result.detail}`;
}
function parseMajorVersion(input: string) {
  const match = input.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}
function localDbUnavailableMessage() {
  return "Postgres not reachable on 127.0.0.1:5432; run `pnpm local:db:up`.";
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
function buildAppCommand() {
  const env = loadServerEnv();
  return {
    command: "pnpm",
    args: [
      "--filter",
      "@the-seven/web",
      "exec",
      "next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(env.port),
    ],
  };
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
    } satisfies CheckResult;
  }

  const result = await runCommand(command, versionArgs);
  return {
    label,
    ok: result.code === 0,
    detail: result.stdout || result.stderr || `${command} is available`,
    fix:
      result.code === 0 ? null : `Run \`pnpm local:bootstrap -- --install\` to repair ${command}.`,
  } satisfies CheckResult;
}

async function checkNodeVersion() {
  const major = parseMajorVersion(process.version);
  return {
    label: "node",
    ok: typeof major === "number" && major >= 22,
    detail: process.version,
    fix: typeof major === "number" && major >= 22 ? null : "Install Node 22+ with Homebrew.",
  } satisfies CheckResult;
}

async function checkDocker() {
  if (!(await commandExists("docker"))) {
    return {
      label: "docker",
      ok: false,
      detail: "docker is not on PATH",
      fix: "Install Docker Desktop or run `pnpm local:bootstrap -- --install`.",
    } satisfies CheckResult;
  }

  const info = await runCommand("docker", ["info"]);
  if (info.code !== 0) {
    return {
      label: "docker",
      ok: false,
      detail: info.stderr || "Docker daemon is unavailable",
      fix: "Start Docker Desktop and rerun the command.",
    } satisfies CheckResult;
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
  } satisfies CheckResult;
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
      } satisfies CheckResult;
    }

    return {
      label: "playwright browser",
      ok: true,
      detail: executablePath,
      fix: null,
    } satisfies CheckResult;
  } catch (error) {
    return {
      label: "playwright browser",
      ok: false,
      detail: error instanceof Error ? error.message : "Chromium is unavailable",
      fix: "Run `pnpm exec playwright install chromium` or `pnpm local:bootstrap -- --install`.",
    } satisfies CheckResult;
  }
}

function checkEnvFilePresence() {
  if (existsSync(envLocalPath)) {
    return {
      label: ".env.local",
      ok: true,
      detail: ".env.local is present",
      fix: null,
    } satisfies CheckResult;
  }

  const detail = existsSync(envLegacyPath)
    ? ".env.local is missing; legacy .env is present"
    : ".env.local is missing";
  return {
    label: ".env.local",
    ok: false,
    detail,
    fix: "Create `.env.local` from `.env.local.example` before running local commands.",
  } satisfies CheckResult;
}

function checkEnvKeys() {
  const assignments = readEnvAssignments(envLocalPath);
  const requiredNonEmptyKeys = [
    "DATABASE_URL",
    "SEVEN_JOB_CREDENTIAL_SECRET",
    "SEVEN_PUBLIC_ORIGIN",
    "SEVEN_APP_NAME",
    "SEVEN_BYOK_KEY",
    "SEVEN_DEMO_OPENROUTER_KEY",
    "SEVEN_DEMO_RESEND_API_KEY",
    "SEVEN_DEMO_EMAIL_FROM",
    "SEVEN_DEMO_TEST_EMAIL",
  ];
  const missing = requiredNonEmptyKeys.filter((key) => {
    const value = assignments.get(key);
    return typeof value !== "string" || value.trim().length === 0;
  });
  const demoEnabled = assignments.get("SEVEN_DEMO_ENABLED") === "1";
  const issues = demoEnabled ? missing : [...missing, "SEVEN_DEMO_ENABLED must be 1"];
  return {
    label: ".env.local keys",
    ok: issues.length === 0,
    detail:
      issues.length === 0 ? "all required local and live keys are present" : issues.join(", "),
    fix:
      issues.length === 0
        ? null
        : "Fill the missing keys in `.env.local` using `.env.local.example` as the template.",
  } satisfies CheckResult;
}

async function collectDoctorChecks() {
  return [
    await checkCommand("brew", ["--version"], "brew"),
    await checkDocker(),
    await checkNodeVersion(),
    await checkCommand("pnpm", ["--version"], "pnpm"),
    await checkCommand("uv", ["--version"], "uv"),
    await checkCommand("cloudflared", ["--version"], "cloudflared"),
    await checkCommand("psql", ["--version"], "psql"),
    await checkCommand("pg_isready", ["--version"], "pg_isready"),
    await checkPlaywrightBrowser(),
    checkEnvFilePresence(),
    checkEnvKeys(),
  ] satisfies ReadonlyArray<CheckResult>;
}

async function runDoctor(showFixes: boolean) {
  const checks = await collectDoctorChecks();
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

async function composeContainerId() {
  const result = await runCommand("docker", buildComposeArgs(["ps", "-q", "postgres"]));
  return result.code === 0 ? result.stdout.trim() : "";
}

async function readComposeHealthStatus() {
  const containerId = await composeContainerId();
  if (!containerId) {
    return "missing";
  }

  const result = await runCommand("docker", [
    "inspect",
    "--format",
    "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
    containerId,
  ]);
  if (result.code !== 0) {
    return "missing";
  }
  return result.stdout.trim() || "unknown";
}

async function waitForComposeHealth() {
  const deadline = Date.now() + healthcheckTimeoutMs;
  while (Date.now() < deadline) {
    const status = await readComposeHealthStatus();
    if (status === "healthy") {
      return;
    }
    await sleep(1_000);
  }

  throw new Error(localDbUnavailableMessage());
}

async function ensureComposeDbHealthy() {
  const status = await readComposeHealthStatus();
  if (status === "healthy") {
    return;
  }

  throw new Error(localDbUnavailableMessage());
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
  await runCommandOrThrow("docker", buildComposeArgs(["up", "-d", "postgres"]));
  await waitForComposeHealth();
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
  const app = buildAppCommand();
  await runCommandOrThrow(app.command, app.args, {
    env: process.env,
    stdio: "inherit",
  });
}

async function runGate() {
  ensureEnvLocalExists();
  await ensureComposeDbHealthy();
  await runCommandOrThrow("uv", ["run", "devtools/gate.py"], {
    env: process.env,
    stdio: "inherit",
  });
}

async function runLive() {
  ensureEnvLocalExists();
  await runDbUp();

  const baseUrl = loadCliEnv().baseUrl;
  const app = buildAppCommand();
  const child = spawn(app.command, app.args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });

  try {
    await waitForHttpReady(baseUrl);
    await runCommandOrThrow("pnpm", ["test:live"], {
      env: {
        ...process.env,
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
    process.exitCode = (await runDoctor(false)) ? 0 : 1;
    return;
  }

  if (command === "bootstrap") {
    if (args.includes("--install")) {
      await installPrerequisites();
    }
    process.exitCode = (await runDoctor(true)) ? 0 : 1;
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
    await runGate();
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
