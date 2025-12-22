import { createHash, randomBytes } from "crypto";

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function hashDemoToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createDemoToken(): Readonly<{ token: string; tokenHash: string }> {
  const token = toBase64Url(randomBytes(32));
  return { token, tokenHash: hashDemoToken(token) };
}
