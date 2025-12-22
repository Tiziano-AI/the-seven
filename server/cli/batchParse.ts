const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_WAIT_INTERVAL_MS = 2000;
const DEFAULT_WAIT_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_CONCURRENCY = 20;
const MAX_WAIT_INTERVAL_MS = 60 * 1000;
const MAX_WAIT_TIMEOUT_MS = 6 * 60 * 60 * 1000;

export type BatchOptions = Readonly<{
  filePath: string;
  baseUrl: string;
  concurrency: number;
  wait: boolean;
  waitIntervalMs: number;
  waitTimeoutMs: number;
}>;

type BatchLine = Readonly<{
  question: string;
  councils: string[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseBatchLine(
  value: unknown
): Readonly<{ ok: true; value: BatchLine } | { ok: false; error: string }> {
  if (!isRecord(value)) {
    return { ok: false, error: "Expected object" };
  }
  const question = value.question;
  if (typeof question !== "string" || question.trim().length === 0) {
    return { ok: false, error: "Missing or blank question" };
  }
  const councils = value.councils;
  if (!Array.isArray(councils) || councils.length === 0) {
    return { ok: false, error: "Missing councils array" };
  }
  const normalized: string[] = [];
  for (const council of councils) {
    if (typeof council !== "string" || council.trim().length === 0) {
      return { ok: false, error: "Council values must be non-empty strings" };
    }
    normalized.push(council.trim());
  }
  return {
    ok: true,
    value: { question: question.trim(), councils: normalized },
  };
}

export function parseArgs(args: string[]): Readonly<{ ok: true; options: BatchOptions } | { ok: false; error: string }> {
  let filePath: string | null = null;
  let baseUrl = process.env.SEVEN_BASE_URL?.trim() || DEFAULT_BASE_URL;
  let concurrency = DEFAULT_CONCURRENCY;
  let wait = false;
  let waitIntervalMs = DEFAULT_WAIT_INTERVAL_MS;
  let waitTimeoutMs = DEFAULT_WAIT_TIMEOUT_MS;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--file" || arg === "-f") {
      filePath = args[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--base-url") {
      baseUrl = args[i + 1] ?? baseUrl;
      i += 1;
      continue;
    }
    if (arg === "--concurrency" || arg === "-c") {
      const raw = args[i + 1] ?? "";
      i += 1;
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_CONCURRENCY) {
        return { ok: false, error: `Invalid concurrency (1-${MAX_CONCURRENCY})` };
      }
      concurrency = parsed;
      continue;
    }
    if (arg === "--wait") {
      wait = true;
      continue;
    }
    if (arg === "--wait-interval-ms") {
      const raw = args[i + 1] ?? "";
      i += 1;
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_WAIT_INTERVAL_MS) {
        return { ok: false, error: `Invalid wait interval (1-${MAX_WAIT_INTERVAL_MS} ms)` };
      }
      waitIntervalMs = parsed;
      continue;
    }
    if (arg === "--wait-timeout-ms") {
      const raw = args[i + 1] ?? "";
      i += 1;
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_WAIT_TIMEOUT_MS) {
        return { ok: false, error: `Invalid wait timeout (1-${MAX_WAIT_TIMEOUT_MS} ms)` };
      }
      waitTimeoutMs = parsed;
      continue;
    }
    return { ok: false, error: `Unknown argument: ${arg}` };
  }

  if (!filePath || filePath.trim().length === 0) {
    return { ok: false, error: "Missing --file" };
  }

  baseUrl = baseUrl.replace(/\/+$/, "");

  return {
    ok: true,
    options: {
      filePath,
      baseUrl,
      concurrency,
      wait,
      waitIntervalMs,
      waitTimeoutMs,
    },
  };
}

export function usage(): string {
  return [
    "Usage:",
    "  pnpm batch -- --file <path> [--concurrency N] [--wait] [--base-url URL] [--wait-interval-ms N] [--wait-timeout-ms N]",
    "",
    "Environment:",
    "  SEVEN_BYOK_KEY=... (required)",
    "  SEVEN_BASE_URL=... (optional, default http://localhost:3000)",
  ].join("\n");
}
