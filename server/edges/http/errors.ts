import type { ZodIssue } from "zod";
import type {
  ErrorDetails,
  ErrorKind,
  ForbiddenDetails,
  InternalErrorDetails,
  InvalidInputDetails,
  NotFoundDetails,
  RateLimitedDetails,
  UnauthorizedDetails,
  UpstreamErrorDetails,
} from "../../../shared/domain/apiErrors";

export type {
  ErrorDetails,
  ErrorKind,
  ForbiddenDetails,
  InternalErrorDetails,
  InvalidInputDetails,
  NotFoundDetails,
  RateLimitedDetails,
  UnauthorizedDetails,
  UpstreamErrorDetails,
} from "../../../shared/domain/apiErrors";

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
