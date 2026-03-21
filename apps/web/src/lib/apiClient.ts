import {
  type ErrorEnvelope,
  errorEnvelopeSchema,
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

export async function apiRequest<T>(input: {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  authHeader?: string | null;
  payloadSchema: z.ZodType<T>;
}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Seven-Ingress": "web",
  };
  if (input.authHeader) {
    headers.Authorization = input.authHeader;
  }

  const response = await fetch(input.path, {
    method: input.method,
    headers,
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  const data = await parseJsonResponse(response);
  if (response.ok) {
    const envelope = successEnvelopeSchema.parse(data);
    return input.payloadSchema.parse(envelope.result.payload);
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
