import { type CommandResult, runCommand } from "./process-utils";

export type OperatorCheckResult = Readonly<{
  label: string;
  ok: boolean;
  detail: string;
  fix: string | null;
}>;

export type PostgresTarget = Readonly<{
  host: string;
  port: string;
  database: string;
}>;

export type ComposeHealthStatus = "missing" | "healthy" | "unhealthy" | "starting" | "unknown";

export type PortOwner =
  | Readonly<{ kind: "docker"; name: string }>
  | Readonly<{ kind: "process"; summary: string }>;

export type CanonicalLocalPostgresStatus = Readonly<{
  target: PostgresTarget;
  composeHealth: ComposeHealthStatus;
  portOwner: PortOwner | null;
}>;

const CANONICAL_COMPOSE_SERVICE = "postgres";
const CANONICAL_CONTAINER_NAME = "the-seven-postgres";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const CANONICAL_TARGET_DETAIL = "127.0.0.1:5432/the_seven";

function parsePostgresTarget(connectionString: string): PostgresTarget {
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: url.port || "5432",
    database: url.pathname.replace(/^\/+/, "") || "postgres",
  };
}

function isCanonicalLocalTarget(target: PostgresTarget): boolean {
  return LOCAL_HOSTS.has(target.host) && target.port === "5432";
}

function formatTarget(target: PostgresTarget): string {
  return `${target.host}:${target.port}/${target.database}`;
}

function normalizeComposeHealthStatus(value: string): ComposeHealthStatus {
  if (value === "healthy") {
    return "healthy";
  }
  if (value === "unhealthy") {
    return "unhealthy";
  }
  if (value === "starting") {
    return "starting";
  }
  if (!value) {
    return "missing";
  }
  return "unknown";
}

async function readComposeContainerId(composeFilePath: string): Promise<string> {
  const result = await runCommand("docker", [
    "compose",
    "-f",
    composeFilePath,
    "ps",
    "-q",
    CANONICAL_COMPOSE_SERVICE,
  ]);
  return result.code === 0 ? result.stdout.trim() : "";
}

export async function readComposeHealthStatus(
  composeFilePath: string,
): Promise<ComposeHealthStatus> {
  const containerId = await readComposeContainerId(composeFilePath);
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

  return normalizeComposeHealthStatus(result.stdout.trim());
}

function parseDockerPortOwner(result: CommandResult, port: string): PortOwner | null {
  if (result.code !== 0 || !result.stdout) {
    return null;
  }

  for (const line of result.stdout.split(/\r?\n/)) {
    const [name, ports] = line.split("\t");
    if (!name || !ports) {
      continue;
    }
    if (
      ports.includes(`0.0.0.0:${port}->`) ||
      ports.includes(`[::]:${port}->`) ||
      ports.includes(`127.0.0.1:${port}->`)
    ) {
      return { kind: "docker", name: name.trim() };
    }
  }

  return null;
}

function parseListeningProcess(result: CommandResult): PortOwner | null {
  if (result.code !== 0 || !result.stdout) {
    return null;
  }

  const [, ...rows] = result.stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const row = rows[0];
  if (!row) {
    return null;
  }

  const parts = row.trim().split(/\s+/);
  const command = parts[0];
  const pid = parts[1];
  if (!command || !pid) {
    return null;
  }

  return { kind: "process", summary: `${command} (pid ${pid})` };
}

async function readPortOwner(port: string): Promise<PortOwner | null> {
  const dockerResult = await runCommand("docker", ["ps", "--format", "{{.Names}}\t{{.Ports}}"]);
  const dockerOwner = parseDockerPortOwner(dockerResult, port);
  if (dockerOwner) {
    return dockerOwner;
  }

  const lsofResult = await runCommand("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]);
  return parseListeningProcess(lsofResult);
}

export async function readCanonicalLocalPostgresStatus(input: {
  composeFilePath: string;
  connectionString: string;
}): Promise<CanonicalLocalPostgresStatus> {
  const target = parsePostgresTarget(input.connectionString);
  if (!isCanonicalLocalTarget(target)) {
    return {
      target,
      composeHealth: "unknown",
      portOwner: null,
    };
  }

  const [composeHealth, portOwner] = await Promise.all([
    readComposeHealthStatus(input.composeFilePath),
    readPortOwner(target.port),
  ]);
  return {
    target,
    composeHealth,
    portOwner,
  };
}

export function describeCanonicalLocalPostgresPort(status: CanonicalLocalPostgresStatus) {
  if (!isCanonicalLocalTarget(status.target)) {
    return {
      ok: false,
      detail: `DATABASE_URL points to ${formatTarget(status.target)}, not canonical local Postgres ${CANONICAL_TARGET_DETAIL}`,
      fix: "Point DATABASE_URL at the compose-managed local Postgres target from `.env.local.example`.",
    };
  }

  if (
    status.composeHealth === "healthy" &&
    status.portOwner?.kind === "docker" &&
    status.portOwner.name === CANONICAL_CONTAINER_NAME
  ) {
    return {
      ok: true,
      detail: `${CANONICAL_CONTAINER_NAME} owns ${status.target.host}:${status.target.port}`,
      fix: null,
    };
  }

  if (status.portOwner?.kind === "docker" && status.portOwner.name !== CANONICAL_CONTAINER_NAME) {
    return {
      ok: false,
      detail: `${status.target.host}:${status.target.port} is owned by Docker container ${status.portOwner.name}`,
      fix: `Stop or reconfigure ${status.portOwner.name} so ${CANONICAL_CONTAINER_NAME} can bind ${status.target.host}:${status.target.port}.`,
    };
  }

  if (status.portOwner?.kind === "process") {
    return {
      ok: false,
      detail: `${status.target.host}:${status.target.port} is owned by ${status.portOwner.summary}`,
      fix: `Stop ${status.portOwner.summary} so ${CANONICAL_CONTAINER_NAME} can bind ${status.target.host}:${status.target.port}.`,
    };
  }

  return {
    ok: true,
    detail: `${status.target.host}:${status.target.port} is available for ${CANONICAL_CONTAINER_NAME}`,
    fix: null,
  };
}

export function toCanonicalLocalPostgresCheck(
  status: CanonicalLocalPostgresStatus,
): OperatorCheckResult {
  const detail = describeCanonicalLocalPostgresPort(status);
  return {
    label: "local postgres port",
    ok: detail.ok,
    detail: detail.detail,
    fix: detail.fix,
  };
}

export function formatCanonicalLocalPostgresUnavailableMessage(
  status: CanonicalLocalPostgresStatus,
) {
  const portCheck = describeCanonicalLocalPostgresPort(status);
  if (!portCheck.ok) {
    return `${portCheck.detail}; ${portCheck.fix}`;
  }

  return `Postgres not reachable on ${status.target.host}:${status.target.port}; run \`pnpm local:db:up\`.`;
}

export function formatCanonicalLocalPostgresBootstrapMessage(input: {
  status: CanonicalLocalPostgresStatus;
  error: unknown;
}) {
  const portCheck = describeCanonicalLocalPostgresPort(input.status);
  if (!portCheck.ok) {
    return `${portCheck.detail}; ${portCheck.fix}`;
  }

  if (
    input.error &&
    typeof input.error === "object" &&
    "code" in input.error &&
    input.error.code === "3D000" &&
    input.status.composeHealth !== "healthy"
  ) {
    return `Database ${input.status.target.database} is missing because ${CANONICAL_CONTAINER_NAME} is not the active Postgres owner on ${input.status.target.host}:${input.status.target.port}; run \`pnpm local:db:up\` after freeing the port.`;
  }

  if (
    input.error &&
    typeof input.error === "object" &&
    "code" in input.error &&
    input.error.code === "3D000"
  ) {
    return `Database ${input.status.target.database} does not exist on ${input.status.target.host}:${input.status.target.port}; run \`pnpm local:db:reset\` to recreate the canonical compose-managed database.`;
  }

  return formatCanonicalLocalPostgresUnavailableMessage(input.status);
}

export function isCanonicalLocalPostgresConnectionFailure(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "3D000"].includes(error.code);
  }

  return (
    error instanceof Error &&
    /connect ECONNREFUSED|getaddrinfo ENOTFOUND|database .* does not exist/i.test(error.message)
  );
}

export async function ensureComposePostgresHealthy(input: {
  composeFilePath: string;
  connectionString: string;
}) {
  const diagnosis = await readCanonicalLocalPostgresStatus(input);
  const portCheck = describeCanonicalLocalPostgresPort(diagnosis);
  if (!portCheck.ok) {
    throw new Error(`${portCheck.detail}; ${portCheck.fix}`);
  }

  const status = await readComposeHealthStatus(input.composeFilePath);
  if (status === "healthy") {
    return;
  }

  throw new Error(formatCanonicalLocalPostgresUnavailableMessage(diagnosis));
}

export async function waitForComposePostgresHealthy(input: {
  composeFilePath: string;
  connectionString: string;
  healthcheckTimeoutMs: number;
  sleep: (ms: number) => Promise<void>;
}) {
  const initialDiagnosis = await readCanonicalLocalPostgresStatus({
    composeFilePath: input.composeFilePath,
    connectionString: input.connectionString,
  });
  const initialPortCheck = describeCanonicalLocalPostgresPort(initialDiagnosis);
  if (!initialPortCheck.ok) {
    throw new Error(`${initialPortCheck.detail}; ${initialPortCheck.fix}`);
  }

  const deadline = Date.now() + input.healthcheckTimeoutMs;
  while (Date.now() < deadline) {
    const status = await readComposeHealthStatus(input.composeFilePath);
    if (status === "healthy") {
      return;
    }
    await input.sleep(1_000);
  }

  const diagnosis = await readCanonicalLocalPostgresStatus({
    composeFilePath: input.composeFilePath,
    connectionString: input.connectionString,
  });
  throw new Error(formatCanonicalLocalPostgresUnavailableMessage(diagnosis));
}
