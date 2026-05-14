import { z } from "zod";
import { type ErrorEnvelope, type ErrorKind, errorEnvelopeSchema } from "./errors";

const successEnvelopeResultSchema = z
  .object({
    resource: z.string(),
    payload: z.unknown(),
  })
  .strict();

export const successEnvelopeSchema = z
  .object({
    schema_version: z.literal(1),
    trace_id: z.string(),
    ts: z.string().datetime(),
    result: successEnvelopeResultSchema,
  })
  .strict();

export type SuccessEnvelope = z.infer<typeof successEnvelopeSchema>;

export function successPayloadSchema<T extends z.ZodTypeAny>(payload: T) {
  return successEnvelopeSchema.extend({
    result: successEnvelopeResultSchema.extend({ payload }).strict(),
  });
}

/**
 * Builds the canonical HTTP success envelope. Callers supply only server-owned
 * trace/time metadata plus a contract registry resource and already-validated
 * payload.
 */
export function buildSuccessEnvelope(input: {
  traceId: string;
  now: Date;
  resource: string;
  payload: unknown;
}): SuccessEnvelope {
  return successEnvelopeSchema.parse({
    schema_version: 1,
    trace_id: input.traceId,
    ts: input.now.toISOString(),
    result: {
      resource: input.resource,
      payload: input.payload,
    },
  });
}

/**
 * Builds the canonical HTTP error envelope. The discriminated error schema is
 * the final guard before the web adapter writes a JSON response.
 */
export function buildErrorEnvelope(input: {
  traceId: string;
  now: Date;
  kind: ErrorKind;
  message: string;
  details: ErrorEnvelope["details"];
}): ErrorEnvelope {
  return errorEnvelopeSchema.parse({
    schema_version: 1,
    trace_id: input.traceId,
    ts: input.now.toISOString(),
    kind: input.kind,
    message: input.message,
    details: input.details,
  });
}
