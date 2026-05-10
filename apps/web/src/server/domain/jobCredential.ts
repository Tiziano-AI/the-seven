import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { serverRuntime } from "@the-seven/config";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v2";
const KEY_ID = "local";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function deriveKey(secret: string): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret, "utf8"),
      Buffer.from(`the-seven:${KEY_ID}`, "utf8"),
      Buffer.from("job-credential:v2", "utf8"),
      KEY_BYTES,
    ),
  );
}

function getKey(): Buffer {
  return deriveKey(serverRuntime().jobCredentialSecret);
}

function aadForJobCredential(input: { sessionId: number; jobId: number }): Buffer {
  return Buffer.from(
    `the-seven.job-credential.${VERSION}.${KEY_ID}.session:${input.sessionId}.job:${input.jobId}`,
    "utf8",
  );
}

export function encryptJobCredential(
  plaintext: string,
  context: { sessionId: number; jobId: number },
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  cipher.setAAD(aadForJobCredential(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    KEY_ID,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptJobCredential(
  value: string,
  context: { sessionId: number; jobId: number },
): string {
  const parts = value.split(".");
  const [version, keyId, ivPart, tagPart, ciphertextPart] = parts;
  if (
    parts.length !== 5 ||
    version !== VERSION ||
    keyId !== KEY_ID ||
    !ivPart ||
    !tagPart ||
    !ciphertextPart
  ) {
    throw new Error("Invalid job credential envelope");
  }

  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAAD(aadForJobCredential(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
