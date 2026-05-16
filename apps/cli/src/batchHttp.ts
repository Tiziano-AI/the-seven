import fs from "node:fs";
import {
  buildRoutePath,
  type CouncilRef,
  errorEnvelopeSchema,
  hasJsonApiNoStore,
  INGRESS_SOURCE_CLI,
  jsonApiCacheControl,
  type RouteContract,
  type RoutePathParams,
  type RouteSuccessPayload,
  routeContract,
  routeDeclaresDenial,
  successPayloadSchema,
  traceHeaderMismatchMessage,
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
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function invalidResponseError(status: number | null, message: string): BatchError {
  return {
    kind: "invalid_response",
    message,
    status,
    traceId: null,
  };
}

function validateNoStoreHeader(route: RouteContract, response: Response): BatchError | null {
  if (hasJsonApiNoStore(response.headers.get("cache-control"))) {
    return null;
  }
  return invalidResponseError(
    response.status,
    `${route.resource} response did not return Cache-Control: ${jsonApiCacheControl}`,
  );
}

function extractBatchError(
  route: RouteContract,
  payload: unknown,
  status: number | null,
  traceHeader: string | null,
): BatchError {
  const parsed = errorEnvelopeSchema.safeParse(payload);
  if (
    !parsed.success ||
    status === null ||
    !routeDeclaresDenial({ route, status, envelope: parsed.data })
  ) {
    return invalidResponseError(status, "Request failed");
  }
  const traceMessage = traceHeaderMismatchMessage({
    traceHeader,
    envelopeTraceId: parsed.data.trace_id,
    context: route.resource,
  });
  if (traceMessage !== null) {
    return invalidResponseError(status, traceMessage);
  }
  return {
    kind: parsed.data.kind,
    message: parsed.data.message,
    status,
    traceId: parsed.data.trace_id,
  };
}

async function requestRoute<Contract extends RouteContract>(input: {
  baseUrl: string;
  apiKey: string;
  ingressVersion: string | null;
  route: Contract;
  params?: RoutePathParams;
  body?: unknown;
}): Promise<
  | Readonly<{ ok: true; payload: RouteSuccessPayload<Contract> }>
  | Readonly<{ ok: false; error: BatchError }>
> {
  const headers = buildHeaders(input.apiKey, input.ingressVersion);
  let body: string | undefined;
  if (input.body !== undefined) {
    body = JSON.stringify(input.route.bodySchema.parse(input.body));
  }

  const response = await fetch(
    new URL(buildRoutePath(input.route, input.params), input.baseUrl).toString(),
    {
      method: input.route.method,
      headers,
      body,
    },
  );

  const cacheError = validateNoStoreHeader(input.route, response);
  const data = await readJson(response);
  if (cacheError) {
    return { ok: false, error: cacheError };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: extractBatchError(
        input.route,
        data,
        response.status,
        response.headers.get("x-trace-id"),
      ),
    };
  }
  if (response.status !== input.route.status) {
    return {
      ok: false,
      error: invalidResponseError(response.status, `Invalid ${input.route.resource} status`),
    };
  }

  const parsed = successPayloadSchema(input.route.successPayloadSchema).safeParse(data);
  if (!parsed.success || parsed.data.result.resource !== input.route.resource) {
    return {
      ok: false,
      error: invalidResponseError(response.status, `Invalid ${input.route.resource} response`),
    };
  }
  const traceMessage = traceHeaderMismatchMessage({
    traceHeader: response.headers.get("x-trace-id"),
    envelopeTraceId: parsed.data.trace_id,
    context: input.route.resource,
  });
  if (traceMessage !== null) {
    return {
      ok: false,
      error: invalidResponseError(response.status, traceMessage),
    };
  }

  return { ok: true, payload: parsed.data.result.payload };
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
  const route = routeContract("sessions.create");
  const result = await requestRoute({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    ingressVersion: input.ingressVersion,
    route,
    body: {
      query: input.task.query,
      councilRef: input.task.councilRef,
    },
  });

  if (!result.ok) {
    return result;
  }

  return { ok: true, sessionId: result.payload.sessionId };
}

export async function waitForSession(input: {
  baseUrl: string;
  apiKey: string;
  ingressVersion: string | null;
  sessionId: number;
  intervalMs: number;
  timeoutMs: number;
}): Promise<WaitResult> {
  const route = routeContract("sessions.get");
  const deadline = Date.now() + input.timeoutMs;
  while (true) {
    const result = await requestRoute({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      ingressVersion: input.ingressVersion,
      route,
      params: { sessionId: input.sessionId },
    });

    if (!result.ok) {
      return result;
    }

    const session = result.payload.session;
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
