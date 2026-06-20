import { cliRuntime } from "@the-seven/config";
import { z } from "zod";
import type { BatchExportFormat } from "./batchHttp";

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_WAIT_INTERVAL_MS = 2_000;
const DEFAULT_WAIT_TIMEOUT_MS = 30 * 60 * 1_000;
const MAX_CONCURRENCY = 20;
const MAX_WAIT_INTERVAL_MS = 60_000;
const MAX_WAIT_TIMEOUT_MS = 6 * 60 * 60 * 1_000;
const EXPORT_FORMATS = [
  "none",
  "markdown",
  "json",
  "both",
] as const satisfies ReadonlyArray<BatchExportFormat>;

const batchLineSchema = z.object({
  query: z.string().trim().min(1),
  councils: z.array(z.string().trim().min(1)).min(1),
});

export type BatchLine = z.infer<typeof batchLineSchema>;

export type BatchOptions = Readonly<{
  filePath: string;
  baseUrl: string;
  concurrency: number;
  wait: boolean;
  exportFormat: BatchExportFormat;
  waitIntervalMs: number;
  waitTimeoutMs: number;
}>;

type ParseArgsResult =
  | Readonly<{ ok: true; options: BatchOptions }>
  | Readonly<{ ok: false; error: string }>;

type ParseBatchLineResult =
  | Readonly<{ ok: true; value: BatchLine }>
  | Readonly<{ ok: false; error: string }>;

function parsePositiveInt(
  raw: string | undefined,
  label: string,
  bounds: Readonly<{ min: number; max: number }>,
) {
  if (!raw) {
    return { ok: false as const, error: `Missing ${label}` };
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < bounds.min || parsed > bounds.max) {
    return { ok: false as const, error: `Invalid ${label} (${bounds.min}-${bounds.max})` };
  }
  return { ok: true as const, value: parsed };
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveBaseUrl(
  value: string | null,
): Readonly<{ ok: true; value: string }> | Readonly<{ ok: false; error: string }> {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    return { ok: false, error: "Missing SEVEN_BASE_URL or --base-url URL" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Invalid base URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Invalid base URL" };
  }

  return { ok: true, value: normalizeBaseUrl(parsed.toString()) };
}

function parseExportFormat(value: string | undefined) {
  if (!value) {
    return { ok: false as const, error: "Missing export format" };
  }
  if (!EXPORT_FORMATS.includes(value as BatchExportFormat) || value === "none") {
    return { ok: false as const, error: "Invalid export format (markdown|json|both)" };
  }
  return { ok: true as const, value: value as Exclude<BatchExportFormat, "none"> };
}

export function usage() {
  return [
    "Usage:",
    "  pnpm batch -- --file <path> [--concurrency N] [--wait] [--export markdown|json|both] [--base-url URL] [--wait-interval-ms N] [--wait-timeout-ms N]",
    "",
    "JSONL input:",
    '  {"query":"Your question","councils":["built_in:founding"]}',
    "",
    "Environment:",
    "  SEVEN_BYOK_KEY=... (required)",
    "  SEVEN_BASE_URL=... or --base-url URL (required)",
  ].join("\n");
}

export function parseArgs(args: ReadonlyArray<string>, env = cliRuntime()): ParseArgsResult {
  let filePath: string | null = null;
  let baseUrl = env.baseUrl;
  let concurrency = DEFAULT_CONCURRENCY;
  let wait = false;
  let exportFormat: BatchExportFormat = "none";
  let waitIntervalMs = DEFAULT_WAIT_INTERVAL_MS;
  let waitTimeoutMs = DEFAULT_WAIT_TIMEOUT_MS;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--file" || arg === "-f") {
      filePath = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--base-url") {
      const next = args[index + 1];
      if (!next || next.startsWith("--")) {
        return { ok: false, error: "Missing --base-url URL" };
      }
      baseUrl = next;
      index += 1;
      continue;
    }
    if (arg === "--concurrency" || arg === "-c") {
      const parsed = parsePositiveInt(args[index + 1], "concurrency", {
        min: 1,
        max: MAX_CONCURRENCY,
      });
      if (!parsed.ok) {
        return parsed;
      }
      concurrency = parsed.value;
      index += 1;
      continue;
    }
    if (arg === "--wait") {
      wait = true;
      continue;
    }
    if (arg === "--export") {
      const parsed = parseExportFormat(args[index + 1]);
      if (!parsed.ok) {
        return parsed;
      }
      exportFormat = parsed.value;
      index += 1;
      continue;
    }
    if (arg === "--wait-interval-ms") {
      const parsed = parsePositiveInt(args[index + 1], "wait interval", {
        min: 1,
        max: MAX_WAIT_INTERVAL_MS,
      });
      if (!parsed.ok) {
        return parsed;
      }
      waitIntervalMs = parsed.value;
      index += 1;
      continue;
    }
    if (arg === "--wait-timeout-ms") {
      const parsed = parsePositiveInt(args[index + 1], "wait timeout", {
        min: 1,
        max: MAX_WAIT_TIMEOUT_MS,
      });
      if (!parsed.ok) {
        return parsed;
      }
      waitTimeoutMs = parsed.value;
      index += 1;
      continue;
    }
    return { ok: false, error: `Unknown argument: ${arg}` };
  }

  if (!filePath || filePath.trim().length === 0) {
    return { ok: false, error: "Missing --file" };
  }
  if (exportFormat !== "none" && !wait) {
    return { ok: false, error: "--export requires --wait" };
  }
  const resolvedBaseUrl = resolveBaseUrl(baseUrl);
  if (!resolvedBaseUrl.ok) {
    return resolvedBaseUrl;
  }

  return {
    ok: true,
    options: {
      filePath,
      baseUrl: resolvedBaseUrl.value,
      concurrency,
      wait,
      exportFormat,
      waitIntervalMs,
      waitTimeoutMs,
    },
  };
}

export function parseBatchLine(value: unknown): ParseBatchLineResult {
  const parsed = batchLineSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid batch line" };
  }
  return { ok: true, value: parsed.data };
}
