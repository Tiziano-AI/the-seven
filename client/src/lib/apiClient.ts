import { z } from "zod";

const successEnvelopeSchema = z.object({
  trace_id: z.string(),
  ts: z.string(),
  result: z.object({
    resource: z.string(),
    payload: z.unknown(),
  }),
});

const errorEnvelopeSchema = z.object({
  kind: z.string(),
  message: z.string(),
  trace_id: z.string(),
  ts: z.string(),
  details: z.unknown(),
});

export class ApiErrorResponse extends Error {
  readonly kind: string;
  readonly traceId: string;
  readonly details: unknown;
  readonly status: number;

  constructor(params: { kind: string; message: string; traceId: string; details: unknown; status: number }) {
    super(params.message);
    this.kind = params.kind;
    this.traceId = params.traceId;
    this.details = params.details;
    this.status = params.status;
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
}

export async function apiRequest<T>(params: {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  authHeader?: string | null;
  payloadSchema: z.ZodSchema<T>;
}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (params.authHeader) {
    headers.Authorization = params.authHeader;
  }

  const response = await fetch(params.path, {
    method: params.method,
    headers,
    body: params.body ? JSON.stringify(params.body) : undefined,
  });

  const data = await parseJsonResponse(response);
  if (response.ok) {
    const envelope = successEnvelopeSchema.parse(data);
    return params.payloadSchema.parse(envelope.result.payload);
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
