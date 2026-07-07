/**
 * AES-256-GCM "secret box" for encrypting secrets at rest — BYO OpenRouter API
 * keys and member IBANs (PRD §9.2, FR-6, FR-7.2). The server-managed key comes
 * from `ENCRYPTION_KEY`. Tokens are self-describing: `iv.tag.ciphertext`, each
 * part base64. Authentication tag detects tampering.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM
const KEY_LENGTH = 32; // AES-256

/** Generate a fresh 32-byte key as base64 (for ENCRYPTION_KEY in .env). */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_LENGTH).toString('base64');
}

/** Parse a key string (base64 or 64-char hex) into a 32-byte buffer. */
function parseKey(key: string): Buffer {
  let buf: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    buf = Buffer.from(key, 'hex');
  } else {
    buf = Buffer.from(key, 'base64');
  }
  if (buf.length !== KEY_LENGTH) {
    throw new RangeError(
      `ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got ${buf.length}); ` +
        'use a base64 or 64-char hex key.',
    );
  }
  return buf;
}

/** Encrypt a plaintext string, returning an `iv.tag.ciphertext` token. */
export function encryptSecret(plaintext: string, key: string): string {
  const keyBuf = parseKey(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

/** Decrypt an `iv.tag.ciphertext` token. Throws on a wrong key or tampering. */
export function decryptSecret(token: string, key: string): string {
  const keyBuf = parseKey(key);
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new TypeError('Malformed secret token (expected iv.tag.ciphertext)');
  }
  const [ivB64, tagB64, ctB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', keyBuf, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export interface SecretBox {
  encrypt(plaintext: string): string;
  decrypt(token: string): string;
}

/** Bind a key once and reuse the encrypt/decrypt pair. */
export function createSecretBox(key: string): SecretBox {
  // Validate eagerly so a bad key fails at construction, not first use.
  parseKey(key);
  return {
    encrypt: (plaintext: string) => encryptSecret(plaintext, key),
    decrypt: (token: string) => decryptSecret(token, key),
  };
}
