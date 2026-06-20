import fs from "node:fs";
import readline from "node:readline";
import { cliRuntime } from "@the-seven/config";
import { type CouncilRef, decodeCouncilRef } from "@the-seven/contracts";
import { type BatchOptions, parseArgs, parseBatchLine, usage } from "./batchArgs";
import {
  type BatchExportFormat,
  resolveCliIngressVersion,
  type SubmitResult,
  submitSession,
  type WaitResult,
  waitForSession,
} from "./batchHttp";

export type { BatchOptions } from "./batchArgs";
export { parseArgs, parseBatchLine, usage } from "./batchArgs";

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
  exportFormat: BatchExportFormat;
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
    exportFormat: options.exportFormat,
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
          exportFormat: input.options.exportFormat,
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
