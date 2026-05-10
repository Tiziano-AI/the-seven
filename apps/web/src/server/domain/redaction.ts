import "server-only";

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /Demo\s+[A-Za-z0-9._~+/=-]+/gi,
  /sk-or-[A-Za-z0-9_-]+/g,
  /sk-[A-Za-z0-9_-]+/g,
  /[A-Za-z0-9_-]{32,}/g,
] as const;

/** Redacts credential-like substrings before they reach public or durable diagnostics. */
export function redactText(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, "[redacted]");
  }
  return redacted;
}

/** Converts an unknown thrown value into a redacted diagnostic message. */
export function redactErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return redactText(error.message);
  }
  return fallback;
}

/** Redacts public limiter scopes without exposing raw IP addresses or emails. */
export function redactRateLimitScope(scope: string): string {
  const parts = scope.split(":");
  for (const sensitiveKind of ["email", "ip"]) {
    const index = parts.indexOf(sensitiveKind);
    if (index >= 0 && parts[index + 1]) {
      return [...parts.slice(0, index + 1), "[redacted]", ...parts.slice(index + 2)].join(":");
    }
  }
  return scope;
}
