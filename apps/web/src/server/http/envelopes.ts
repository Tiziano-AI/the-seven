import "server-only";

import { buildErrorEnvelope, buildSuccessEnvelope, type ErrorEnvelope } from "@the-seven/contracts";
import { NextResponse } from "next/server";
import { redactText } from "../domain/redaction";

export function jsonSuccess(input: {
  traceId: string;
  resource: string;
  payload: unknown;
  now: Date;
  status?: number;
}) {
  const envelope = buildSuccessEnvelope(input);
  return NextResponse.json(envelope, {
    status: input.status ?? 200,
    headers: {
      "X-Trace-Id": input.traceId,
    },
  });
}

export function jsonError(input: {
  traceId: string;
  kind: ErrorEnvelope["kind"];
  message: string;
  details: ErrorEnvelope["details"];
  now: Date;
  status: number;
}) {
  const envelope = buildErrorEnvelope({
    ...input,
    message: redactText(input.message),
  });
  return NextResponse.json(envelope, {
    status: input.status,
    headers: {
      "X-Trace-Id": input.traceId,
    },
  });
}
