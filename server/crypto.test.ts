/**
 * Tests for client-side encryption module
 * 
 * Note: These tests run in Node.js environment using vitest.
 * The Web Crypto API is available in Node.js 15+ via globalThis.crypto.
 */

import { describe, test, expect, beforeEach } from 'vitest';

// Mock localStorage for Node.js environment
const localStorageMock: Storage = (() => {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] ?? null;
    },
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

globalThis.localStorage = localStorageMock;

// Import crypto functions after setting up mocks
import {
  encryptAndStoreApiKey,
  decryptApiKey,
  hasEncryptedKey,
  clearEncryptedKey,
  getEncryptedKeyMetadata,
  estimatePasswordStrength,
  getPasswordStrengthLabel,
} from '../client/src/lib/crypto';

describe('API Key Encryption', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  test('encrypts and stores API key successfully', async () => {
    const apiKey = 'sk-or-v1-test-key-12345';
    const password = 'strong-password-123';

    await encryptAndStoreApiKey(password, apiKey);

    expect(hasEncryptedKey()).toBe(true);
    const stored = localStorage.getItem('encrypted_api_key');
    expect(stored).toBeTruthy();
    
    const parsed = JSON.parse(stored!);
    expect(parsed.version).toBe(1);
    expect(parsed.algorithm).toBe('AES-GCM');
    expect(parsed.kdf).toBe('PBKDF2');
    expect(parsed.iterations).toBe(100000);
    expect(parsed.ciphertext).toBeInstanceOf(Array);
    expect(parsed.iv).toBeInstanceOf(Array);
    expect(parsed.salt).toBeInstanceOf(Array);
  });

  test('decrypts API key correctly with correct password', async () => {
    const apiKey = 'sk-or-v1-test-key-67890';
    const password = 'my-secure-password';

    await encryptAndStoreApiKey(password, apiKey);
    const decrypted = await decryptApiKey(password);

    expect(decrypted).toBe(apiKey);
  });

  test('fails to decrypt with wrong password', async () => {
    const apiKey = 'sk-or-v1-test-key-99999';
    const correctPassword = 'correct-password';
    const wrongPassword = 'wrong-password';

    await encryptAndStoreApiKey(correctPassword, apiKey);

    await expect(decryptApiKey(wrongPassword)).rejects.toThrow('Incorrect password');
  });

  test('generates unique IVs for each encryption', async () => {
    const apiKey1 = 'sk-or-v1-test-key-1';
    const apiKey2 = 'sk-or-v1-test-key-2';
    const password = 'same-password';

    await encryptAndStoreApiKey(password, apiKey1);
    const stored1 = JSON.parse(localStorage.getItem('encrypted_api_key')!);

    localStorageMock.clear();

    await encryptAndStoreApiKey(password, apiKey2);
    const stored2 = JSON.parse(localStorage.getItem('encrypted_api_key')!);

    // IVs should be different even with same password
    expect(stored1.iv).not.toEqual(stored2.iv);
    expect(stored1.salt).not.toEqual(stored2.salt);
  });

  test('rejects weak passwords', async () => {
    const apiKey = 'sk-or-v1-test-key';
    const weakPassword = 'short';

    await expect(encryptAndStoreApiKey(weakPassword, apiKey)).rejects.toThrow(
      'Password must be at least 8 characters'
    );
  });

  test('rejects invalid API key format', async () => {
    const invalidApiKey = 'not-a-valid-key';
    const password = 'strong-password-123';

    await expect(encryptAndStoreApiKey(password, invalidApiKey)).rejects.toThrow(
      'Invalid OpenRouter API key format'
    );
  });

  test('clearEncryptedKey removes stored data', async () => {
    const apiKey = 'sk-or-v1-test-key';
    const password = 'password123456';

    await encryptAndStoreApiKey(password, apiKey);
    expect(hasEncryptedKey()).toBe(true);

    clearEncryptedKey();
    expect(hasEncryptedKey()).toBe(false);
  });

  test('getEncryptedKeyMetadata returns correct data', async () => {
    const apiKey = 'sk-or-v1-test-key';
    const password = 'password123456';

    await encryptAndStoreApiKey(password, apiKey);
    const metadata = getEncryptedKeyMetadata();

    expect(metadata).toBeTruthy();
    expect(metadata?.iterations).toBe(100000);
    expect(metadata?.createdAt).toBeTruthy();
    expect(new Date(metadata!.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('handles corrupted data gracefully', async () => {
    localStorage.setItem('encrypted_api_key', 'corrupted-json-data');

    await expect(decryptApiKey('any-password')).rejects.toThrow();
  });

  test('handles missing encrypted key', async () => {
    await expect(decryptApiKey('any-password')).rejects.toThrow('No encrypted API key found');
  });
});

describe('Password Strength Estimation', () => {
  test('rates empty password as 0', () => {
    expect(estimatePasswordStrength('')).toBe(0);
  });

  test('rates short password as weak', () => {
    expect(estimatePasswordStrength('abc')).toBeLessThanOrEqual(1);
  });

  test('rates 8+ character password higher', () => {
    const score = estimatePasswordStrength('abcdefgh');
    expect(score).toBeGreaterThan(0);
  });

  test('rates diverse password higher', () => {
    const weakScore = estimatePasswordStrength('aaaaaaaa');
    const strongScore = estimatePasswordStrength('Abc123!@');
    expect(strongScore).toBeGreaterThan(weakScore);
  });

  test('caps score at 4', () => {
    const score = estimatePasswordStrength('VeryStr0ng!P@ssw0rd123');
    expect(score).toBeLessThanOrEqual(4);
  });

  test('getPasswordStrengthLabel returns correct labels', () => {
    expect(getPasswordStrengthLabel(0).label).toBe('Too weak');
    expect(getPasswordStrengthLabel(1).label).toBe('Weak');
    expect(getPasswordStrengthLabel(2).label).toBe('Fair');
    expect(getPasswordStrengthLabel(3).label).toBe('Good');
    expect(getPasswordStrengthLabel(4).label).toBe('Strong');
  });

  test('getPasswordStrengthLabel returns correct colors', () => {
    expect(getPasswordStrengthLabel(0).color).toBe('text-destructive');
    expect(getPasswordStrengthLabel(4).color).toBe('text-violet');
  });
});

describe('Encryption Security Properties', () => {
  test('same password produces different ciphertexts (due to unique IV)', async () => {
    const apiKey = 'sk-or-v1-test-key';
    const password = 'same-password';

    await encryptAndStoreApiKey(password, apiKey);
    const stored1 = JSON.parse(localStorage.getItem('encrypted_api_key')!);

    localStorageMock.clear();

    await encryptAndStoreApiKey(password, apiKey);
    const stored2 = JSON.parse(localStorage.getItem('encrypted_api_key')!);

    // Ciphertexts should be different due to unique IVs
    expect(stored1.ciphertext).not.toEqual(stored2.ciphertext);
  });

  test('uses PBKDF2 with 100k iterations', async () => {
    const apiKey = 'sk-or-v1-test-key';
    const password = 'test-password';

    await encryptAndStoreApiKey(password, apiKey);
    const stored = JSON.parse(localStorage.getItem('encrypted_api_key')!);

    expect(stored.iterations).toBe(100000);
  });

  test('uses AES-GCM algorithm', async () => {
    const apiKey = 'sk-or-v1-test-key';
    const password = 'test-password';

    await encryptAndStoreApiKey(password, apiKey);
    const stored = JSON.parse(localStorage.getItem('encrypted_api_key')!);

    expect(stored.algorithm).toBe('AES-GCM');
  });

  test('IV is 12 bytes (96 bits)', async () => {
    const apiKey = 'sk-or-v1-test-key';
    const password = 'test-password';

    await encryptAndStoreApiKey(password, apiKey);
    const stored = JSON.parse(localStorage.getItem('encrypted_api_key')!);

    expect(stored.iv.length).toBe(12);
  });

  test('salt is 16 bytes (128 bits)', async () => {
    const apiKey = 'sk-or-v1-test-key';
    const password = 'test-password';

    await encryptAndStoreApiKey(password, apiKey);
    const stored = JSON.parse(localStorage.getItem('encrypted_api_key')!);

    expect(stored.salt.length).toBe(16);
  });
});

describe('Edge Cases', () => {
  test('handles very long API keys', async () => {
    const longApiKey = 'sk-or-v1-' + 'a'.repeat(1000);
    const password = 'test-password';

    await encryptAndStoreApiKey(password, longApiKey);
    const decrypted = await decryptApiKey(password);

    expect(decrypted).toBe(longApiKey);
  });

  test('handles special characters in password', async () => {
    const apiKey = 'sk-or-v1-test-key';
    const password = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    await encryptAndStoreApiKey(password, apiKey);
    const decrypted = await decryptApiKey(password);

    expect(decrypted).toBe(apiKey);
  });

  test('handles unicode characters in password', async () => {
    const apiKey = 'sk-or-v1-test-key';
    const password = 'пароль密码🔐';

    await encryptAndStoreApiKey(password, apiKey);
    const decrypted = await decryptApiKey(password);

    expect(decrypted).toBe(apiKey);
  });

  test('handles empty password gracefully', async () => {
    const apiKey = 'sk-or-v1-test-key';
    const password = '';

    await expect(encryptAndStoreApiKey(password, apiKey)).rejects.toThrow();
  });
});
