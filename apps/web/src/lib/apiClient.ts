import {
  buildRoutePath,
  type ErrorEnvelope,
  errorEnvelopeSchema,
  forbiddenDetailsSchema,
  type RouteContract,
  type RoutePathParams,
  type RouteSuccessPayload,
  requireJsonApiNoStore,
  requireTraceHeaderMatchesEnvelope,
  routeDeclaresDenial,
  successEnvelopeSchema,
  unauthorizedDetailsSchema,
} from "@the-seven/contracts";
import type { z } from "zod";

export class ApiErrorResponse extends Error {
  readonly kind: ErrorEnvelope["kind"];
  readonly traceId: string;
  readonly details: ErrorEnvelope["details"];
  readonly status: number;
  readonly unauthorizedReason: "missing_auth" | "invalid_token" | "expired_token" | null;
  readonly forbiddenReason: string | null;

  constructor(input: {
    kind: ErrorEnvelope["kind"];
    message: string;
    traceId: string;
    details: ErrorEnvelope["details"];
    status: number;
  }) {
    super(input.message);
    this.kind = input.kind;
    this.traceId = input.traceId;
    this.details = input.details;
    this.status = input.status;
    this.unauthorizedReason =
      input.kind === "unauthorized" ? unauthorizedDetailsSchema.parse(input.details).reason : null;
    this.forbiddenReason =
      input.kind === "forbidden" ? forbiddenDetailsSchema.parse(input.details).reason : null;
  }
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

function assertJsonApiResponseCache(response: Response, route: RouteContract): void {
  requireJsonApiNoStore({
    cacheControl: response.headers.get("cache-control"),
    context: `API ${route.method} ${route.path}`,
  });
}

function responseContext(route: RouteContract): string {
  return `API ${route.method} ${route.path}`;
}

function resolveRequestUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  if (typeof window !== "undefined") {
    return path;
  }

  const baseUrl = process.env.SEVEN_BASE_URL;
  if (!baseUrl) {
    throw new Error("SEVEN_BASE_URL is required for server-side API requests.");
  }
  return new URL(path, baseUrl).toString();
}

function parseSchema<Schema extends z.ZodType>(schema: Schema, input: unknown): Schema["_output"] {
  return schema.parse(input);
}

function routeAcceptsNoBody(route: RouteContract): boolean {
  return route.bodySchema.safeParse({}).success;
}

export async function apiRequest<Contract extends RouteContract>(input: {
  route: Contract;
  params?: RoutePathParams;
  body?: unknown;
  authHeader?: string | null;
}): Promise<RouteSuccessPayload<Contract>> {
  const headers: Record<string, string> = {
    "X-Seven-Ingress": "web",
  };
  if (input.authHeader) {
    headers.Authorization = input.authHeader;
  }

  let body: string | undefined;
  const noBodyRoute = routeAcceptsNoBody(input.route);
  if (input.body !== undefined && noBodyRoute) {
    throw new Error(`API ${input.route.method} ${input.route.path} does not accept a request body`);
  }
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(input.route.bodySchema.parse(input.body));
  } else if (!noBodyRoute) {
    input.route.bodySchema.parse(input.body);
  }

  const response = await fetch(resolveRequestUrl(buildRoutePath(input.route, input.params)), {
    method: input.route.method,
    headers,
    body,
    credentials: "same-origin",
  });

  assertJsonApiResponseCache(response, input.route);
  const data = await parseJsonResponse(response);
  if (response.ok) {
    if (response.status !== input.route.status) {
      throw new Error(
        `API status mismatch: expected ${input.route.status}, received ${response.status}`,
      );
    }
    const envelope = successEnvelopeSchema.parse(data);
    requireTraceHeaderMatchesEnvelope({
      traceHeader: response.headers.get("x-trace-id"),
      envelopeTraceId: envelope.trace_id,
      context: responseContext(input.route),
    });
    if (envelope.result.resource !== input.route.resource) {
      throw new Error(
        `API resource mismatch: expected ${input.route.resource}, received ${envelope.result.resource}`,
      );
    }
    return parseSchema(input.route.successPayloadSchema, envelope.result.payload);
  }

  const errorEnvelope = errorEnvelopeSchema.parse(data);
  requireTraceHeaderMatchesEnvelope({
    traceHeader: response.headers.get("x-trace-id"),
    envelopeTraceId: errorEnvelope.trace_id,
    context: responseContext(input.route),
  });
  if (
    !routeDeclaresDenial({
      route: input.route,
      status: response.status,
      envelope: errorEnvelope,
    })
  ) {
    throw new Error(
      `API denial mismatch: ${input.route.method} ${input.route.path} returned ${response.status} ${errorEnvelope.kind}`,
    );
  }
  throw new ApiErrorResponse({
    kind: errorEnvelope.kind,
    message: errorEnvelope.message,
    traceId: errorEnvelope.trace_id,
    details: errorEnvelope.details,
    status: response.status,
  });
}
