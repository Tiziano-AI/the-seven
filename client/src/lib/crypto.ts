/**
 * Client-Side Encryption for API Keys
 * 
 * This module implements AES-256-GCM encryption with PBKDF2 key derivation
 * to securely store OpenRouter API keys in browser localStorage.
 * 
 * Security Model:
 * - API key encrypted with AES-256-GCM (authenticated encryption)
 * - Encryption key derived from user password using PBKDF2 (100k iterations)
 * - Password never stored, only used to derive encryption key
 * - Encrypted data stored in localStorage with IV and salt
 * - Password never leaves the browser; the server receives the plaintext API key only transiently (per request)
 * 
 * @see ARCH.md for canonical posture and security notes
 */

const STORAGE_KEY = 'encrypted_api_key';
const PBKDF2_ITERATIONS = 100000; // OWASP recommendation for 2024
const SALT_LENGTH = 16; // 128 bits
const IV_LENGTH = 12; // 96 bits (standard for AES-GCM)
const KEY_LENGTH = 256; // AES-256

/**
 * Storage schema for encrypted API key
 */
export interface EncryptedKeyData {
  version: number;
  ciphertext: number[]; // Uint8Array serialized as array
  iv: number[]; // Initialization vector
  salt: number[]; // PBKDF2 salt
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2';
  iterations: number;
  createdAt: string; // ISO 8601 timestamp
}

/**
 * Derive an encryption key from a password using PBKDF2
 * 
 * @param password - User-provided password
 * @param salt - Random salt (16 bytes)
 * @returns CryptoKey for AES-GCM encryption/decryption (non-extractable)
 */
async function deriveKey(password: string, salt: BufferSource): Promise<CryptoKey> {
  // Import password as raw key material
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false, // Not extractable
    ['deriveKey']
  );

  // Derive AES-GCM key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false, // Non-extractable (prevents key export even if XSS occurs)
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt an API key with a password and store in localStorage
 * 
 * @param password - User-provided password
 * @param apiKey - OpenRouter API key to encrypt
 * @throws Error if encryption fails
 */
export async function encryptAndStoreApiKey(password: string, apiKey: string): Promise<void> {
  // Validate inputs
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  if (!apiKey || !apiKey.startsWith('sk-or-v1-')) {
    throw new Error('Invalid OpenRouter API key format');
  }

  try {
    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH)) as Uint8Array;
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as Uint8Array;

    // Derive encryption key from password
    const key = await deriveKey(password, salt as BufferSource);

    // Encrypt API key
    const encoded = new TextEncoder().encode(apiKey);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      encoded
    );

    // Prepare storage object
    const encryptedData: EncryptedKeyData = {
      version: 1,
      ciphertext: Array.from(new Uint8Array(ciphertext)),
      iv: Array.from(iv),
      salt: Array.from(salt),
      algorithm: 'AES-GCM',
      kdf: 'PBKDF2',
      iterations: PBKDF2_ITERATIONS,
      createdAt: new Date().toISOString(),
    };

    // Store in localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(encryptedData));
  } catch (error) {
    throw new Error('Failed to encrypt API key. Please try again.');
  }
}

/**
 * Decrypt an API key from localStorage using a password
 * 
 * @param password - User-provided password
 * @returns Decrypted API key
 * @throws Error if decryption fails (wrong password or corrupted data)
 */
export async function decryptApiKey(password: string): Promise<string> {
  // Validate input
  if (!password) {
    throw new Error('Password is required');
  }

  // Retrieve encrypted data
  const storedData = localStorage.getItem(STORAGE_KEY);
  if (!storedData) {
    throw new Error('No encrypted API key found');
  }

  try {
    // Parse stored data
    const encryptedData: EncryptedKeyData = JSON.parse(storedData);

    // Validate schema
    if (encryptedData.version !== 1 || encryptedData.algorithm !== 'AES-GCM') {
      throw new Error('Unsupported encryption format');
    }

    // Convert arrays back to Uint8Array
    const salt = new Uint8Array(encryptedData.salt);
    const iv = new Uint8Array(encryptedData.iv);
    const ciphertext = new Uint8Array(encryptedData.ciphertext);

    // Derive decryption key from password
    const key = await deriveKey(password, salt);

    // Decrypt API key
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );

    // Decode and return
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    // Distinguish between wrong password and other errors
    if (error instanceof Error && error.name === 'OperationError') {
      throw new Error('Incorrect password');
    }
    throw new Error('Failed to decrypt API key. Data may be corrupted.');
  }
}

/**
 * Check if an encrypted API key exists in storage
 * 
 * @returns true if encrypted key exists
 */
export function hasEncryptedKey(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Clear encrypted API key from storage
 * Used when user forgets password or wants to reset
 */
export function clearEncryptedKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get metadata about stored encrypted key without decrypting
 * 
 * @returns Metadata or null if no key exists
 */
export function getEncryptedKeyMetadata(): Pick<EncryptedKeyData, 'createdAt' | 'iterations'> | null {
  const storedData = localStorage.getItem(STORAGE_KEY);
  if (!storedData) return null;

  try {
    const data: EncryptedKeyData = JSON.parse(storedData);
    return {
      createdAt: data.createdAt,
      iterations: data.iterations,
    };
  } catch (_error: unknown) {
    return null;
  }
}

/**
 * Estimate password strength (0-4 scale)
 * 
 * @param password - Password to evaluate
 * @returns Strength score: 0 (weak) to 4 (very strong)
 */
export function estimatePasswordStrength(password: string): number {
  if (!password) return 0;
  
  let score = 0;
  
  // Length
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  
  // Character diversity
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  
  return Math.min(score, 4);
}

/**
 * Get human-readable password strength label
 * 
 * @param score - Strength score from estimatePasswordStrength()
 * @returns Label and color
 */
export function getPasswordStrengthLabel(score: number): { label: string; color: string } {
  const labels = [
    { label: 'Too weak', color: 'text-destructive' },
    { label: 'Weak', color: 'text-destructive' },
    { label: 'Fair', color: 'text-gold' },
    { label: 'Good', color: 'text-evergreen' },
    { label: 'Strong', color: 'text-violet' },
  ];
  return labels[score] || labels[0];
}
