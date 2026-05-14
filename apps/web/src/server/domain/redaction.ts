import "server-only";

import type { ErrorEnvelope } from "@the-seven/contracts";

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /sk-or-[A-Za-z0-9_-]+/g,
  /sk-[A-Za-z0-9_-]+/g,
] as const;
const CONFIGURED_SECRET_ENV_KEYS = [
  "SEVEN_BYOK_KEY",
  "SEVEN_DEMO_OPENROUTER_KEY",
  "SEVEN_DEMO_RESEND_API_KEY",
  "SEVEN_JOB_CREDENTIAL_SECRET",
  "SEVEN_PLAYWRIGHT_DEMO_COOKIE",
] as const;

function configuredSecretValues(): string[] {
  const values: string[] = [];
  for (const key of CONFIGURED_SECRET_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value && value.length >= 8) {
      values.push(value);
    }
  }
  return [...new Set(values)].sort((left, right) => right.length - left.length);
}

/** Redacts credential-like substrings before they reach public or durable diagnostics. */
export function redactText(value: string): string {
  let redacted = value;
  for (const secret of configuredSecretValues()) {
    redacted = redacted.replaceAll(secret, "[redacted]");
  }
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
  return redactText(fallback);
}

/** Redacts public HTTP error detail strings before they reach callers or UI diagnostics. */
export function redactErrorDetails(details: ErrorEnvelope["details"]): ErrorEnvelope["details"] {
  if ("issues" in details) {
    return {
      ...details,
      issues: details.issues.map((issue) => ({
        path: redactText(issue.path),
        message: redactText(issue.message),
      })),
    };
  }
  if ("reason" in details) {
    return { reason: redactText(details.reason) };
  }
  if ("resource" in details) {
    return { resource: redactText(details.resource) };
  }
  if ("scope" in details) {
    return {
      ...details,
      scope: redactText(details.scope),
    };
  }
  return details;
}

/** Redacts public limiter scopes without exposing raw IP addresses or emails. */
export function redactRateLimitScope(scope: string): string {
  const parts = scope.split(":");
  for (const sensitiveKind of ["email", "ip"]) {
    const index = parts.indexOf(sensitiveKind);
    if (index >= 0 && index < parts.length - 1) {
      return [...parts.slice(0, index + 1), "[redacted]"].join(":");
    }
  }
  return scope;
}
