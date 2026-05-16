/** Returns a contract violation message when header and envelope trace truth differ. */
export function traceHeaderMismatchMessage(input: {
  traceHeader: string | null;
  envelopeTraceId: string;
  context: string;
}): string | null {
  if (input.traceHeader === input.envelopeTraceId) {
    return null;
  }
  return `${input.context} trace header does not match envelope trace_id (X-Trace-Id).`;
}

/** Throws when a JSON API response splits canonical trace truth across header and envelope. */
export function requireTraceHeaderMatchesEnvelope(input: {
  traceHeader: string | null;
  envelopeTraceId: string;
  context: string;
}): void {
  const message = traceHeaderMismatchMessage(input);
  if (message !== null) {
    throw new Error(message);
  }
}
