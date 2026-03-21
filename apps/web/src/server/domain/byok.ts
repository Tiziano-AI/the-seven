import "server-only";

import { createHash } from "node:crypto";

export function deriveByokIdFromApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}
