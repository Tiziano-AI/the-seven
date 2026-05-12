import {
  buildRoutePath,
  type ErrorEnvelope,
  errorEnvelopeSchema,
  type RouteContract,
  type RoutePathParams,
  type RouteSuccessPayload,
  successEnvelopeSchema,
} from "@the-seven/contracts";
import type { z } from "zod";

export class ApiErrorResponse extends Error {
  readonly kind: ErrorEnvelope["kind"];
  readonly traceId: string;
  readonly details: ErrorEnvelope["details"];
  readonly status: number;

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
  }
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
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
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(input.route.bodySchema.parse(input.body));
  } else if (!input.route.bodySchema.safeParse({}).success) {
    input.route.bodySchema.parse(input.body);
  }

  const response = await fetch(resolveRequestUrl(buildRoutePath(input.route, input.params)), {
    method: input.route.method,
    headers,
    body,
    credentials: "same-origin",
  });

  const data = await parseJsonResponse(response);
  if (response.ok) {
    const envelope = successEnvelopeSchema.parse(data);
    if (envelope.result.resource !== input.route.resource) {
      throw new Error(
        `API resource mismatch: expected ${input.route.resource}, received ${envelope.result.resource}`,
      );
    }
    return parseSchema(input.route.successPayloadSchema, envelope.result.payload);
  }

  const errorEnvelope = errorEnvelopeSchema.parse(data);
  throw new ApiErrorResponse({
    kind: errorEnvelope.kind,
    message: errorEnvelope.message,
    traceId: errorEnvelope.trace_id,
    details: errorEnvelope.details,
    status: response.status,
  });
}
