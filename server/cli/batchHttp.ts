import { INGRESS_SOURCE_CLI } from "../../shared/domain/ingress";
import type { CouncilRef } from "../../shared/domain/councilRef";

const SESSION_STATUSES = ["pending", "processing", "completed", "failed"] as const;

type SessionStatus = (typeof SESSION_STATUSES)[number];

export type BatchError = Readonly<{
  kind: string;
  message: string;
  status: number | null;
}>;

export type SubmitResult =
  | Readonly<{ ok: true; sessionId: number }>
  | Readonly<{ ok: false; error: BatchError }>;

export type WaitResult =
  | Readonly<{ ok: true; status: "completed" | "failed"; failureKind: string | null }>
  | Readonly<{ ok: false; error: BatchError }>;

type SubmitTask = Readonly<{
  question: string;
  councilRef: CouncilRef;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSessionStatus(value: unknown): SessionStatus | null {
  if (typeof value !== "string") return null;
  return (SESSION_STATUSES as readonly string[]).includes(value) ? (value as SessionStatus) : null;
}

function parseSuccessEnvelope(value: unknown): unknown | null {
  if (!isRecord(value)) return null;
  const result = value.result;
  if (!isRecord(result)) return null;
  return result.payload ?? null;
}

function extractSubmitSessionId(payload: unknown): number | null {
  if (!isRecord(payload)) return null;
  const sessionId = payload.sessionId;
  if (typeof sessionId !== "number" || !Number.isFinite(sessionId)) return null;
  if (!Number.isInteger(sessionId) || sessionId <= 0) return null;
  return sessionId;
}

function extractSessionStatus(payload: unknown): Readonly<{ status: SessionStatus; failureKind: string | null }> | null {
  if (!isRecord(payload)) return null;
  const session = payload.session;
  if (!isRecord(session)) return null;
  const status = parseSessionStatus(session.status);
  if (!status) return null;
  const failureKind = typeof session.failureKind === "string" ? session.failureKind : null;
  return { status, failureKind };
}

function extractError(value: unknown, status: number | null): BatchError {
  if (isRecord(value)) {
    const kind = typeof value.kind === "string" ? value.kind : "http_error";
    const message = typeof value.message === "string" ? value.message : "Request failed";
    return { kind, message, status };
  }
  return { kind: "http_error", message: "Request failed", status };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildHeaders(apiKey: string, ingressVersion: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "X-Seven-Ingress": INGRESS_SOURCE_CLI,
  };
  if (ingressVersion) {
    headers["X-Seven-Ingress-Version"] = ingressVersion;
  }
  return headers;
}

export async function submitQuery(params: {
  baseUrl: string;
  apiKey: string;
  ingressVersion: string | null;
  task: SubmitTask;
}): Promise<SubmitResult> {
  const response = await fetch(`${params.baseUrl}/api/query/submit`, {
    method: "POST",
    headers: {
      ...buildHeaders(params.apiKey, params.ingressVersion),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: params.task.question,
      councilRef: params.task.councilRef,
    }),
  });

  const json = await readJson(response);
  if (!response.ok) {
    return { ok: false, error: extractError(json, response.status) };
  }

  const payload = parseSuccessEnvelope(json);
  const sessionId = extractSubmitSessionId(payload);
  if (!sessionId) {
    return { ok: false, error: { kind: "invalid_response", message: "Missing sessionId", status: response.status } };
  }
  return { ok: true, sessionId };
}

async function fetchSessionStatus(params: {
  baseUrl: string;
  apiKey: string;
  ingressVersion: string | null;
  sessionId: number;
}): Promise<Readonly<{ ok: true; status: SessionStatus; failureKind: string | null } | { ok: false; error: BatchError }>> {
  const response = await fetch(`${params.baseUrl}/api/query/sessions/${params.sessionId}`, {
    method: "GET",
    headers: buildHeaders(params.apiKey, params.ingressVersion),
  });

  const json = await readJson(response);
  if (!response.ok) {
    return { ok: false, error: extractError(json, response.status) };
  }
  const payload = parseSuccessEnvelope(json);
  const status = extractSessionStatus(payload);
  if (!status) {
    return { ok: false, error: { kind: "invalid_response", message: "Missing session status", status: response.status } };
  }
  return { ok: true, status: status.status, failureKind: status.failureKind };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForSession(params: {
  baseUrl: string;
  apiKey: string;
  ingressVersion: string | null;
  sessionId: number;
  intervalMs: number;
  timeoutMs: number;
}): Promise<WaitResult> {
  const deadline = Date.now() + params.timeoutMs;
  while (true) {
    const status = await fetchSessionStatus({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      ingressVersion: params.ingressVersion,
      sessionId: params.sessionId,
    });

    if (!status.ok) {
      return { ok: false, error: status.error };
    }

    if (status.status === "completed" || status.status === "failed") {
      return { ok: true, status: status.status, failureKind: status.failureKind };
    }

    if (Date.now() >= deadline) {
      return {
        ok: false,
        error: { kind: "timeout", message: "Wait timeout exceeded", status: null },
      };
    }

    await sleep(params.intervalMs);
  }
}
