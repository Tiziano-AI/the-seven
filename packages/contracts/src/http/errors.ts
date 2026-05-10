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

export type InvalidInputIssue = Readonly<{ path: string; message: string }>;

/** Public HTTP contract error used by adapters and services before envelope emission. */
export class HttpContractError extends Error {
  readonly kind: ErrorKind;
  readonly details: ErrorEnvelope["details"];
  readonly status: number;

  constructor(input: {
    kind: ErrorKind;
    message: string;
    details: ErrorEnvelope["details"];
    status: number;
  }) {
    super(input.message);
    this.kind = input.kind;
    this.details = input.details;
    this.status = input.status;
  }
}

/** Builds canonical `invalid_input` details from public validation issues. */
export function invalidInputDetails(issues: ReadonlyArray<InvalidInputIssue>) {
  return invalidInputDetailsSchema.parse({ issues });
}

/** Builds canonical `unauthorized` details without leaking credential material. */
export function unauthorizedDetails(reason: "missing_auth" | "invalid_token" | "expired_token") {
  return unauthorizedDetailsSchema.parse({ reason });
}

/** Builds canonical `forbidden` details for policy denials. */
export function forbiddenDetails(reason: string) {
  return forbiddenDetailsSchema.parse({ reason });
}

/** Builds canonical `not_found` details for resource denials. */
export function notFoundDetails(resource: string) {
  return notFoundDetailsSchema.parse({ resource });
}

/** Builds canonical `rate_limited` details for public limiter denials. */
export function rateLimitedDetails(input: {
  scope: string;
  limit: number;
  windowSeconds: number;
  resetAt: string;
}) {
  return rateLimitedDetailsSchema.parse(input);
}

/** Builds canonical `upstream_error` details for provider transport failures. */
export function upstreamErrorDetails(input: {
  service: "openrouter" | "resend";
  status: number | null;
}) {
  return upstreamErrorDetailsSchema.parse(input);
}

/** Builds canonical `internal_error` details from an opaque server error id. */
export function internalErrorDetails(errorId: string) {
  return internalErrorDetailsSchema.parse({ errorId });
}
