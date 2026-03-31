import "server-only";

import { NextResponse } from "next/server";

export function jsonSuccess(input: {
  traceId: string;
  resource: string;
  payload: unknown;
  now: Date;
  status?: number;
}) {
  return NextResponse.json(
    {
      schema_version: 1,
      trace_id: input.traceId,
      ts: input.now.toISOString(),
      result: {
        resource: input.resource,
        payload: input.payload,
      },
    },
    {
      status: input.status ?? 200,
      headers: {
        "X-Trace-Id": input.traceId,
      },
    },
  );
}

export function jsonError(input: {
  traceId: string;
  kind: string;
  message: string;
  details: object;
  now: Date;
  status: number;
}) {
  return NextResponse.json(
    {
      schema_version: 1,
      trace_id: input.traceId,
      ts: input.now.toISOString(),
      kind: input.kind,
      message: input.message,
      details: input.details,
    },
    {
      status: input.status,
      headers: {
        "X-Trace-Id": input.traceId,
      },
    },
  );
}
