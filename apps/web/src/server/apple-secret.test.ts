import { beforeEach, describe, expect, it } from 'vitest';
import { decodeJwt, decodeProtectedHeader, exportPKCS8, generateKeyPair } from 'jose';
import {
  APPLE_MAX_SECRET_LIFETIME_SEC,
  appleClientSecret,
  initAppleClientSecret,
  mintAppleClientSecret,
  __resetAppleSecretForTests,
  type AppleSecretConfig,
} from './apple-secret.js';

async function makeConfig(overrides: Partial<AppleSecretConfig> = {}): Promise<AppleSecretConfig> {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  return {
    teamId: 'TEAM123456',
    keyId: 'KEY7890AB',
    servicesId: 'company.lnrt.evenup.web',
    privateKey: await exportPKCS8(privateKey),
    ...overrides,
  };
}

describe('mintAppleClientSecret', () => {
  it('signs with ES256 and carries the key id in the header', async () => {
    const cfg = await makeConfig();
    const header = decodeProtectedHeader(await mintAppleClientSecret(cfg));
    expect(header.alg).toBe('ES256');
    expect(header.kid).toBe('KEY7890AB');
  });

  it('sets the claims Apple requires', async () => {
    const cfg = await makeConfig();
    const claims = decodeJwt(await mintAppleClientSecret(cfg));
    expect(claims.iss).toBe('TEAM123456');
    expect(claims.aud).toBe('https://appleid.apple.com');
    expect(claims.sub).toBe('company.lnrt.evenup.web');
  });

  it('never exceeds Apple\'s maximum secret lifetime', async () => {
    const cfg = await makeConfig();
    const claims = decodeJwt(await mintAppleClientSecret(cfg, 1_800_000_000));
    expect(claims.iat).toBe(1_800_000_000);
    expect(claims.exp! - claims.iat!).toBeLessThanOrEqual(APPLE_MAX_SECRET_LIFETIME_SEC);
    expect(claims.exp! - claims.iat!).toBeGreaterThan(0);
  });

  it('accepts a \\n-escaped private key, as env transports deliver it', async () => {
    const cfg = await makeConfig();
    const escaped = { ...cfg, privateKey: cfg.privateKey.replace(/\n/g, '\\n') };
    const claims = decodeJwt(await mintAppleClientSecret(escaped));
    expect(claims.iss).toBe('TEAM123456');
  });

  it('rejects a private key that is not valid PKCS8', async () => {
    const cfg = await makeConfig({ privateKey: 'not-a-key' });
    await expect(mintAppleClientSecret(cfg)).rejects.toThrow();
  });
});

describe('appleClientSecret', () => {
  beforeEach(() => {
    __resetAppleSecretForTests();
  });

  it('throws before initialization rather than returning an empty secret', () => {
    expect(() => appleClientSecret()).toThrow(/not initialized/i);
  });

  it('returns a string, never a Promise', async () => {
    await initAppleClientSecret(await makeConfig());
    expect(typeof appleClientSecret()).toBe('string');
  });

  it('serves the cached token on repeat reads', async () => {
    await initAppleClientSecret(await makeConfig());
    expect(appleClientSecret()).toBe(appleClientSecret());
  });
});
