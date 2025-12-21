import { createHash } from "crypto";

const BYOK_ID_HEX_RE = /^[0-9a-f]{64}$/;

export function deriveByokIdFromApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

export function isByokId(value: string): boolean {
  return BYOK_ID_HEX_RE.test(value);
}

