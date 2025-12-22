import fs from "fs";
import readline from "readline";
import { decodeCouncilRef, type CouncilRef } from "../../shared/domain/councilRef";
import { isSingleLine } from "../../shared/domain/strings";
import { parseBatchLine, type BatchOptions } from "./batchParse";
import { submitQuery, waitForSession, type SubmitResult, type WaitResult } from "./batchHttp";

type BatchTask = Readonly<{
  line: number;
  question: string;
  councilRef: CouncilRef;
  councilRefText: string;
}>;

export type BatchItemResult = Readonly<{
  line: number;
  question: string | null;
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

type BatchRunParams = Readonly<{
  options: BatchOptions;
  apiKey: string;
  ingressVersion: string | null;
  onProgress?: (message: string) => void;
}>;

async function runPool<T>(
  items: ReadonlyArray<T>,
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = cursor;
      if (index >= items.length) return;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

export function resolveIngressVersion(): string | null {
  try {
    const packageUrl = new URL("../../package.json", import.meta.url);
    const raw = fs.readFileSync(packageUrl, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "object" && parsed !== null && "version" in parsed) {
      const version = parsed.version;
      if (typeof version === "string") {
        const trimmed = version.trim();
        if (trimmed && isSingleLine(trimmed)) {
          return `cli@${trimmed}`;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function runBatch(params: BatchRunParams): Promise<BatchOutput> {
  const startedAt = new Date().toISOString();
  const options = params.options;

  const input = fs.createReadStream(options.filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  const items: Array<BatchItemResult | null> = [];
  const tasks: Array<Readonly<{ index: number; task: BatchTask }>> = [];

  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber += 1;
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(trimmed) as unknown;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Invalid JSON";
      items.push({
        line: lineNumber,
        question: null,
        councilRef: null,
        submit: { ok: false, error: { kind: "invalid_input", message, status: null } },
        wait: null,
      });
      continue;
    }

    const parsedLine = parseBatchLine(parsedJson);
    if (!parsedLine.ok) {
      items.push({
        line: lineNumber,
        question: null,
        councilRef: null,
        submit: { ok: false, error: { kind: "invalid_input", message: parsedLine.error, status: null } },
        wait: null,
      });
      continue;
    }

    for (const council of parsedLine.value.councils) {
      const councilRef = decodeCouncilRef(council);
      if (!councilRef) {
        items.push({
          line: lineNumber,
          question: parsedLine.value.question,
          councilRef: council,
          submit: {
            ok: false,
            error: { kind: "invalid_input", message: "Invalid council ref", status: null },
          },
          wait: null,
        });
        continue;
      }

      const index = items.length;
      items.push(null);
      tasks.push({
        index,
        task: {
          line: lineNumber,
          question: parsedLine.value.question,
          councilRef,
          councilRefText: council,
        },
      });
    }
  }

  params.onProgress?.(`Loaded ${tasks.length} runnable item(s).`);

  await runPool(tasks, options.concurrency, async ({ index, task }) => {
    const submit = await submitQuery({
      baseUrl: options.baseUrl,
      apiKey: params.apiKey,
      ingressVersion: params.ingressVersion,
      task: { question: task.question, councilRef: task.councilRef },
    });

    if (!submit.ok) {
      items[index] = {
        line: task.line,
        question: task.question,
        councilRef: task.councilRefText,
        submit,
        wait: null,
      };
      return;
    }

    let waitResult: WaitResult | null = null;
    if (options.wait) {
      waitResult = await waitForSession({
        baseUrl: options.baseUrl,
        apiKey: params.apiKey,
        ingressVersion: params.ingressVersion,
        sessionId: submit.sessionId,
        intervalMs: options.waitIntervalMs,
        timeoutMs: options.waitTimeoutMs,
      });
    }

    items[index] = {
      line: task.line,
      question: task.question,
      councilRef: task.councilRefText,
      submit,
      wait: waitResult,
    };
  });

  const finalized = items.map((item, idx) => {
    if (!item) {
      return {
        line: idx + 1,
        question: null,
        councilRef: null,
        submit: { ok: false, error: { kind: "internal_error", message: "Missing result", status: null } },
        wait: null,
      } satisfies BatchItemResult;
    }
    return item;
  });

  const submitOk = finalized.filter((item) => item.submit.ok).length;
  const submitFailed = finalized.length - submitOk;
  const waitCompleted = finalized.filter((item) => item.wait?.ok && item.wait.status === "completed").length;
  const waitFailed = finalized.filter((item) => item.wait?.ok && item.wait.status === "failed").length;
  const waitErrors = finalized.filter((item) => item.wait && !item.wait.ok).length;

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
      totalItems: finalized.length,
      submitOk,
      submitFailed,
      waitCompleted,
      waitFailed,
      waitErrors,
    },
    items: finalized,
  };
}
