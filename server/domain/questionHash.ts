import { createHash } from "crypto";

function normalizeQuestion(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

export function hashQuestion(value: string): string {
  const normalized = normalizeQuestion(value);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
