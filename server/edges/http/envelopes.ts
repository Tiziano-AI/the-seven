import type { Response } from "express";

export type SuccessEnvelope<T> = Readonly<{
  trace_id: string;
  ts: string;
  result: Readonly<{
    resource: string;
    payload: T;
  }>;
}>;

export type ErrorEnvelope<Kind extends string, Details> = Readonly<{
  kind: Kind;
  message: string;
  trace_id: string;
  ts: string;
  details: Details;
}>;

export function buildSuccessEnvelope<T>(params: {
  traceId: string;
  resource: string;
  payload: T;
  now: Date;
}): SuccessEnvelope<T> {
  return {
    trace_id: params.traceId,
    ts: params.now.toISOString(),
    result: {
      resource: params.resource,
      payload: params.payload,
    },
  };
}

export function buildErrorEnvelope<Kind extends string, Details>(params: {
  traceId: string;
  kind: Kind;
  message: string;
  details: Details;
  now: Date;
}): ErrorEnvelope<Kind, Details> {
  return {
    kind: params.kind,
    message: params.message,
    trace_id: params.traceId,
    ts: params.now.toISOString(),
    details: params.details,
  };
}

export function sendSuccess<T>(res: Response, params: {
  traceId: string;
  resource: string;
  payload: T;
  now: Date;
  status?: number;
}): void {
  const status = params.status ?? 200;
  res.status(status).json(buildSuccessEnvelope(params));
}

export function sendError<Kind extends string, Details>(res: Response, params: {
  traceId: string;
  kind: Kind;
  message: string;
  details: Details;
  now: Date;
  status: number;
}): void {
  res.status(params.status).json(buildErrorEnvelope(params));
}
