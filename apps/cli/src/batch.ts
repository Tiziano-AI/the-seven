import fs from "node:fs";
import readline from "node:readline";
import { cliRuntime } from "@the-seven/config";
import { type CouncilRef, decodeCouncilRef } from "@the-seven/contracts";
import { z } from "zod";
import {
  resolveCliIngressVersion,
  type SubmitResult,
  submitSession,
  type WaitResult,
  waitForSession,
} from "./batchHttp";

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_WAIT_INTERVAL_MS = 2_000;
const DEFAULT_WAIT_TIMEOUT_MS = 30 * 60 * 1_000;
const MAX_CONCURRENCY = 20;
const MAX_WAIT_INTERVAL_MS = 60_000;
const MAX_WAIT_TIMEOUT_MS = 6 * 60 * 60 * 1_000;

const batchLineSchema = z.object({
  query: z.string().trim().min(1),
  councils: z.array(z.string().trim().min(1)).min(1),
});

type BatchLine = z.infer<typeof batchLineSchema>;

export type BatchOptions = Readonly<{
  filePath: string;
  baseUrl: string;
  concurrency: number;
  wait: boolean;
  waitIntervalMs: number;
  waitTimeoutMs: number;
}>;

type BatchTask = Readonly<{
  line: number;
  query: string;
  councilRef: CouncilRef;
  councilRefText: string;
}>;

export type BatchItemResult = Readonly<{
  line: number;
  query: string | null;
  councilRef: string | null;
  submit: SubmitResult;
  wait: WaitResult | null;
}>;

export type BatchOutput = Readonly<{
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  file: string;
  baseUrl: string;
  concurrency: number;
  wait: boolean;
  waitIntervalMs: number;
  waitTimeoutMs: number;
  summary: Readonly<{
    totalItems: number;
    submitOk: number;
    submitFailed: number;
    waitCompleted: number;
    waitFailed: number;
    waitErrors: number;
  }>;
  items: ReadonlyArray<BatchItemResult>;
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

export function usage() {
  return [
    "Usage:",
    "  pnpm batch -- --file <path> [--concurrency N] [--wait] [--base-url URL] [--wait-interval-ms N] [--wait-timeout-ms N]",
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
      baseUrl = args[index + 1] ?? baseUrl;
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

  return {
    ok: true,
    options: {
      filePath,
      baseUrl: normalizeBaseUrl(baseUrl),
      concurrency,
      wait,
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

async function runPool<T>(
  items: ReadonlyArray<T>,
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) {
        return;
      }
      await worker(item, index);
    }
  });
  await Promise.all(runners);
}

function summarizeResults(
  items: ReadonlyArray<BatchItemResult>,
  options: BatchOptions,
  startedAt: string,
): BatchOutput {
  const submitOk = items.filter((item) => item.submit.ok).length;
  const submitFailed = items.length - submitOk;
  const waitCompleted = items.filter(
    (item) => item.wait?.ok && item.wait.status === "completed",
  ).length;
  const waitFailed = items.filter((item) => item.wait?.ok && item.wait.status === "failed").length;
  const waitErrors = items.filter((item) => item.wait && !item.wait.ok).length;

  return {
    ok: submitFailed === 0 && (!options.wait || (waitFailed === 0 && waitErrors === 0)),
    startedAt,
    finishedAt: new Date().toISOString(),
    file: options.filePath,
    baseUrl: options.baseUrl,
    concurrency: options.concurrency,
    wait: options.wait,
    waitIntervalMs: options.waitIntervalMs,
    waitTimeoutMs: options.waitTimeoutMs,
    summary: {
      totalItems: items.length,
      submitOk,
      submitFailed,
      waitCompleted,
      waitFailed,
      waitErrors,
    },
    items,
  };
}

export async function runBatch(input: {
  options: BatchOptions;
  apiKey: string;
  onProgress?: (message: string) => void;
}): Promise<BatchOutput> {
  const startedAt = new Date().toISOString();
  const ingressVersion = await resolveCliIngressVersion();
  const results: Array<BatchItemResult | null> = [];
  const tasks: Array<Readonly<{ index: number; task: BatchTask }>> = [];

  const stream = fs.createReadStream(input.options.filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(trimmed);
    } catch (error) {
      results.push({
        line: lineNumber,
        query: null,
        councilRef: null,
        submit: {
          ok: false,
          error: {
            kind: "invalid_input",
            message: error instanceof Error ? error.message : "Invalid JSON",
            status: null,
            traceId: null,
          },
        },
        wait: null,
      });
      continue;
    }

    const parsedLine = parseBatchLine(parsedJson);
    if (!parsedLine.ok) {
      results.push({
        line: lineNumber,
        query: null,
        councilRef: null,
        submit: {
          ok: false,
          error: {
            kind: "invalid_input",
            message: parsedLine.error,
            status: null,
            traceId: null,
          },
        },
        wait: null,
      });
      continue;
    }

    for (const councilText of parsedLine.value.councils) {
      const councilRef = decodeCouncilRef(councilText);
      if (!councilRef) {
        results.push({
          line: lineNumber,
          query: parsedLine.value.query,
          councilRef: councilText,
          submit: {
            ok: false,
            error: {
              kind: "invalid_input",
              message: "Invalid council ref",
              status: null,
              traceId: null,
            },
          },
          wait: null,
        });
        continue;
      }

      const resultIndex = results.length;
      results.push(null);
      tasks.push({
        index: resultIndex,
        task: {
          line: lineNumber,
          query: parsedLine.value.query,
          councilRef,
          councilRefText: councilText,
        },
      });
    }
  }

  input.onProgress?.(`Loaded ${tasks.length} runnable item(s).`);

  await runPool(tasks, input.options.concurrency, async ({ index, task }) => {
    const submit = await submitSession({
      baseUrl: input.options.baseUrl,
      apiKey: input.apiKey,
      ingressVersion,
      task: {
        query: task.query,
        councilRef: task.councilRef,
      },
    });

    if (!submit.ok) {
      results[index] = {
        line: task.line,
        query: task.query,
        councilRef: task.councilRefText,
        submit,
        wait: null,
      };
      return;
    }

    const wait = input.options.wait
      ? await waitForSession({
          baseUrl: input.options.baseUrl,
          apiKey: input.apiKey,
          ingressVersion,
          sessionId: submit.sessionId,
          intervalMs: input.options.waitIntervalMs,
          timeoutMs: input.options.waitTimeoutMs,
        })
      : null;

    results[index] = {
      line: task.line,
      query: task.query,
      councilRef: task.councilRefText,
      submit,
      wait,
    };
  });

  const finalized = results.map((item, index) => {
    if (item) {
      return item;
    }
    return {
      line: index + 1,
      query: null,
      councilRef: null,
      submit: {
        ok: false,
        error: {
          kind: "internal_error",
          message: "Missing batch result",
          status: null,
          traceId: null,
        },
      },
      wait: null,
    } satisfies BatchItemResult;
  });

  return summarizeResults(finalized, input.options, startedAt);
}

export async function runCli(args: ReadonlyArray<string>, env = cliRuntime()) {
  const parsedArgs = parseArgs(args, env);
  if (!parsedArgs.ok) {
    process.stderr.write(`${parsedArgs.error}\n${usage()}\n`);
    return 1;
  }

  if (!env.byokKey) {
    process.stderr.write(`Missing SEVEN_BYOK_KEY.\n${usage()}\n`);
    return 1;
  }

  const output = await runBatch({
    options: parsedArgs.options,
    apiKey: env.byokKey,
    onProgress: (message) => {
      process.stderr.write(`${message}\n`);
    },
  });

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return output.ok ? 0 : 1;
}
