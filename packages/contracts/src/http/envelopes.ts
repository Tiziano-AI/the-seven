import { z } from "zod";

export const successEnvelopeSchema = z.object({
  schema_version: z.literal(1),
  trace_id: z.string(),
  ts: z.string().datetime(),
  result: z.object({
    resource: z.string(),
    payload: z.unknown(),
  }),
});

export function successPayloadSchema<T extends z.ZodTypeAny>(payload: T) {
  return successEnvelopeSchema.extend({
    result: z.object({
      resource: z.string(),
      payload,
    }),
  });
}
