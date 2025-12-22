import type { ZodIssue } from "zod";

export type ErrorKind =
  | "invalid_input"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "upstream_error"
  | "internal_error";

export type InvalidInputDetails = Readonly<{
  issues: ReadonlyArray<Readonly<{ path: string; message: string }>>;
}>;

export type UnauthorizedDetails = Readonly<{
  reason: "missing_auth" | "invalid_token" | "expired_token";
}>;

export type ForbiddenDetails = Readonly<{
  reason: string;
}>;

export type NotFoundDetails = Readonly<{
  resource: string;
}>;

export type RateLimitedDetails = Readonly<{
  scope: string;
  limit: number;
  windowSeconds: number;
  resetAt: string;
}>;

export type UpstreamErrorDetails = Readonly<{
  service: "openrouter" | "resend";
  status: number | null;
}>;

export type InternalErrorDetails = Readonly<{
  error_id: string;
}>;

export type ErrorDetails =
  | InvalidInputDetails
  | UnauthorizedDetails
  | ForbiddenDetails
  | NotFoundDetails
  | RateLimitedDetails
  | UpstreamErrorDetails
  | InternalErrorDetails;

export class EdgeError extends Error {
  readonly kind: ErrorKind;
  readonly details: ErrorDetails;
  readonly status: number;

  constructor(params: { kind: ErrorKind; message: string; details: ErrorDetails; status: number }) {
    super(params.message);
    this.kind = params.kind;
    this.details = params.details;
    this.status = params.status;
  }
}

export function zodIssuesToDetails(issues: ZodIssue[]): InvalidInputDetails {
  return {
    issues: issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}
