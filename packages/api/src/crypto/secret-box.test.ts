import { describe, expect, test } from 'vitest';
import {
  generateEncryptionKey,
  createSecretBox,
  encryptSecret,
  decryptSecret,
} from './secret-box.js';

const KEY = generateEncryptionKey();

describe('AES-256-GCM secret box (§9.2 — encrypt BYO keys & IBANs at rest)', () => {
  test('round-trips a secret', () => {
    const token = encryptSecret('sk-or-v1-abc123', KEY);
    expect(decryptSecret(token, KEY)).toBe('sk-or-v1-abc123');
  });

  test('produces a different ciphertext each time (random IV)', () => {
    expect(encryptSecret('same', KEY)).not.toBe(encryptSecret('same', KEY));
  });

  test('round-trips unicode and empty strings', () => {
    expect(decryptSecret(encryptSecret('Žofie 🔑', KEY), KEY)).toBe('Žofie 🔑');
    expect(decryptSecret(encryptSecret('', KEY), KEY)).toBe('');
  });

  test('fails to decrypt with the wrong key', () => {
    const token = encryptSecret('secret', KEY);
    expect(() => decryptSecret(token, generateEncryptionKey())).toThrow();
  });

  test('fails to decrypt tampered ciphertext (GCM auth tag)', () => {
    const token = encryptSecret('secret', KEY);
    const parts = token.split('.');
    const tampered = [parts[0], parts[1], 'AAAA' + (parts[2] ?? '').slice(4)].join('.');
    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });

  test('rejects a malformed token', () => {
    expect(() => decryptSecret('not-a-token', KEY)).toThrow();
  });

  test('accepts a 64-char hex key and a base64 key', () => {
    const hexKey = 'a'.repeat(64);
    expect(decryptSecret(encryptSecret('x', hexKey), hexKey)).toBe('x');
  });

  test('rejects a key of the wrong length', () => {
    expect(() => encryptSecret('x', 'tooshort')).toThrow();
  });

  test('createSecretBox binds a key for reuse', () => {
    const box = createSecretBox(KEY);
    expect(box.decrypt(box.encrypt('hello'))).toBe('hello');
  });

  test('generateEncryptionKey returns a parseable 32-byte base64 key', () => {
    const k = generateEncryptionKey();
    expect(Buffer.from(k, 'base64')).toHaveLength(32);
  });
});
