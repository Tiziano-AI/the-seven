import fs from "node:fs";
import {
  type CouncilRef,
  errorEnvelopeSchema,
  INGRESS_SOURCE_CLI,
  querySubmitBodySchema,
  sessionDetailPayloadSchema,
  submitPayloadSchema,
  successPayloadSchema,
} from "@the-seven/contracts";
import { z } from "zod";

const cliPackageSchema = z.object({
  version: z.string().trim().min(1),
});

export type BatchError = Readonly<{
  kind: string;
  message: string;
  status: number | null;
  traceId: string | null;
}>;

export type SubmitResult =
  | Readonly<{ ok: true; sessionId: number }>
  | Readonly<{ ok: false; error: BatchError }>;

export type WaitResult =
  | Readonly<{ ok: true; status: "completed" | "failed"; failureKind: string | null }>
  | Readonly<{ ok: false; error: BatchError }>;

async function resolveIngressVersion() {
  try {
    const packageUrl = new URL("../package.json", import.meta.url);
    const raw = await fs.promises.readFile(packageUrl, "utf8");
    const parsed = cliPackageSchema.safeParse(JSON.parse(raw));
    return parsed.success ? `cli@${parsed.data.version}` : null;
  } catch {
    return null;
  }
}

function buildHeaders(apiKey: string, ingressVersion: string | null): HeadersInit {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("Content-Type", "application/json");
  headers.set("X-Seven-Ingress", INGRESS_SOURCE_CLI);
  if (ingressVersion) {
    headers.set("X-Seven-Ingress-Version", ingressVersion);
  }
  return headers;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  return JSON.parse(text);
}

function invalidResponseError(status: number | null, message: string): BatchError {
  return {
    kind: "invalid_response",
    message,
    status,
    traceId: null,
  };
}

function extractBatchError(payload: unknown, status: number | null): BatchError {
  const parsed = errorEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    return invalidResponseError(status, "Request failed");
  }
  return {
    kind: parsed.data.kind,
    message: parsed.data.message,
    status,
    traceId: parsed.data.trace_id,
  };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function submitSession(input: {
  baseUrl: string;
  apiKey: string;
  ingressVersion: string | null;
  task: Readonly<{ query: string; councilRef: CouncilRef }>;
}): Promise<SubmitResult> {
  const response = await fetch(`${input.baseUrl}/api/v1/sessions`, {
    method: "POST",
    headers: buildHeaders(input.apiKey, input.ingressVersion),
    body: JSON.stringify(
      querySubmitBodySchema.parse({
        query: input.task.query,
        councilRef: input.task.councilRef,
      }),
    ),
  });

  const payload = await readJson(response);
  if (!response.ok) {
    return { ok: false, error: extractBatchError(payload, response.status) };
  }

  const parsed = successPayloadSchema(submitPayloadSchema).safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: invalidResponseError(response.status, "Missing sessionId in successful response"),
    };
  }

  return { ok: true, sessionId: parsed.data.result.payload.sessionId };
}

export async function waitForSession(input: {
  baseUrl: string;
  apiKey: string;
  ingressVersion: string | null;
  sessionId: number;
  intervalMs: number;
  timeoutMs: number;
}): Promise<WaitResult> {
  const deadline = Date.now() + input.timeoutMs;
  while (true) {
    const response = await fetch(`${input.baseUrl}/api/v1/sessions/${input.sessionId}`, {
      method: "GET",
      headers: buildHeaders(input.apiKey, input.ingressVersion),
    });

    const payload = await readJson(response);
    if (!response.ok) {
      return { ok: false, error: extractBatchError(payload, response.status) };
    }

    const parsed = successPayloadSchema(sessionDetailPayloadSchema).safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        error: invalidResponseError(
          response.status,
          "Missing session detail in successful response",
        ),
      };
    }

    const session = parsed.data.result.payload.session;
    if (session.status === "completed" || session.status === "failed") {
      return {
        ok: true,
        status: session.status,
        failureKind: session.failureKind,
      };
    }

    if (Date.now() >= deadline) {
      return {
        ok: false,
        error: {
          kind: "timeout",
          message: "Wait timeout exceeded",
          status: null,
          traceId: null,
        },
      };
    }

    await sleep(input.intervalMs);
  }
}

export async function resolveCliIngressVersion() {
  return resolveIngressVersion();
}
