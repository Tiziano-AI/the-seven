export type SessionIdParseResult =
  | Readonly<{ ok: true; sessionId: number }>
  | Readonly<{ ok: false; error: string }>;

export function parseSessionIdFromRouteParam(
  param: string | undefined
): SessionIdParseResult {
  const raw = param?.trim();
  if (!raw) return { ok: false, error: "Missing session id" };

  if (!/^\d+$/.test(raw)) {
    return { ok: false, error: "Session id must be a positive integer" };
  }

  const sessionId = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
    return { ok: false, error: "Session id must be a positive safe integer" };
  }

  return { ok: true, sessionId };
}
