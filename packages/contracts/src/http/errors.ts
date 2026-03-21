import { z } from "zod";

export const ERROR_KINDS = [
  "invalid_input",
  "unauthorized",
  "forbidden",
  "not_found",
  "rate_limited",
  "upstream_error",
  "internal_error",
] as const;

export type ErrorKind = (typeof ERROR_KINDS)[number];

export const invalidInputDetailsSchema = z.object({
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
});

export const unauthorizedDetailsSchema = z.object({
  reason: z.enum(["missing_auth", "invalid_token", "expired_token"]),
});

export const forbiddenDetailsSchema = z.object({
  reason: z.string(),
});

export const notFoundDetailsSchema = z.object({
  resource: z.string(),
});

export const rateLimitedDetailsSchema = z.object({
  scope: z.string(),
  limit: z.number().int(),
  windowSeconds: z.number().int(),
  resetAt: z.string().datetime(),
});

export const upstreamErrorDetailsSchema = z.object({
  service: z.enum(["openrouter", "resend"]),
  status: z.number().int().nullable(),
});

export const internalErrorDetailsSchema = z.object({
  errorId: z.string(),
});

const baseErrorEnvelopeSchema = z.object({
  schema_version: z.literal(1),
  trace_id: z.string(),
  ts: z.string().datetime(),
  message: z.string(),
});

export const errorEnvelopeSchema = z.discriminatedUnion("kind", [
  baseErrorEnvelopeSchema.extend({
    kind: z.literal("invalid_input"),
    details: invalidInputDetailsSchema,
  }),
  baseErrorEnvelopeSchema.extend({
    kind: z.literal("unauthorized"),
    details: unauthorizedDetailsSchema,
  }),
  baseErrorEnvelopeSchema.extend({
    kind: z.literal("forbidden"),
    details: forbiddenDetailsSchema,
  }),
  baseErrorEnvelopeSchema.extend({
    kind: z.literal("not_found"),
    details: notFoundDetailsSchema,
  }),
  baseErrorEnvelopeSchema.extend({
    kind: z.literal("rate_limited"),
    details: rateLimitedDetailsSchema,
  }),
  baseErrorEnvelopeSchema.extend({
    kind: z.literal("upstream_error"),
    details: upstreamErrorDetailsSchema,
  }),
  baseErrorEnvelopeSchema.extend({
    kind: z.literal("internal_error"),
    details: internalErrorDetailsSchema,
  }),
]);

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
