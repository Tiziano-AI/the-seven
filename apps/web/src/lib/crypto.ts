import { z } from "zod";

const STORAGE_KEY = "seven.encrypted_api_key";
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

const encryptedKeyDataSchema = z.object({
  version: z.literal(1),
  ciphertext: z.array(z.number().int().min(0).max(255)),
  iv: z.array(z.number().int().min(0).max(255)),
  salt: z.array(z.number().int().min(0).max(255)),
  iterations: z.literal(PBKDF2_ITERATIONS),
  createdAt: z.string().datetime(),
});

type EncryptedKeyData = z.infer<typeof encryptedKeyDataSchema>;

function toOwnedBytes(value: Uint8Array) {
  const buffer = new ArrayBuffer(value.byteLength);
  const bytes = new Uint8Array(buffer);
  bytes.set(value);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array) {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    toOwnedBytes(new TextEncoder().encode(password)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toOwnedBytes(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

export function hasEncryptedKey() {
  return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) !== null;
}

export function clearEncryptedKey() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
}

export async function encryptAndStoreApiKey(password: string, apiKey: string) {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toOwnedBytes(iv) },
    key,
    toOwnedBytes(new TextEncoder().encode(apiKey)),
  );

  const payload: EncryptedKeyData = {
    version: 1,
    ciphertext: Array.from(new Uint8Array(encrypted)),
    iv: Array.from(iv),
    salt: Array.from(salt),
    iterations: PBKDF2_ITERATIONS,
    createdAt: new Date().toISOString(),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export async function decryptStoredApiKey(password: string) {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    throw new Error("No encrypted API key found");
  }

  let parsed: EncryptedKeyData;
  try {
    parsed = encryptedKeyDataSchema.parse(JSON.parse(raw));
  } catch {
    throw new Error("Stored key data is corrupted");
  }

  try {
    const key = await deriveKey(password, new Uint8Array(parsed.salt));
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toOwnedBytes(new Uint8Array(parsed.iv)) },
      key,
      toOwnedBytes(new Uint8Array(parsed.ciphertext)),
    );
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    if (error instanceof Error && error.name === "OperationError") {
      throw new Error("Incorrect password");
    }
    throw new Error("Failed to decrypt stored API key");
  }
}
