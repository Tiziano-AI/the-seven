import "server-only";

import { createHash } from "node:crypto";

function normalizeQuestion(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

export function hashQuestion(value: string): string {
  return createHash("sha256").update(normalizeQuestion(value), "utf8").digest("hex");
}
