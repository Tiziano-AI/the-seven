import "server-only";

import { createHash, randomBytes } from "node:crypto";

export function hashDemoToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createDemoToken(): Readonly<{ token: string; tokenHash: string }> {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashDemoToken(token),
  };
}
