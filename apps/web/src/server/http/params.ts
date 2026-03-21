import "server-only";

import { EdgeError } from "./errors";

export function parsePositiveIntSegment(value: string, label: string) {
  if (!/^\d+$/.test(value)) {
    throw new EdgeError({
      kind: "invalid_input",
      message: `Invalid ${label}`,
      details: { issues: [{ path: label, message: `Invalid ${label}` }] },
      status: 400,
    });
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new EdgeError({
      kind: "invalid_input",
      message: `Invalid ${label}`,
      details: { issues: [{ path: label, message: `Invalid ${label}` }] },
      status: 400,
    });
  }

  return parsed;
}
