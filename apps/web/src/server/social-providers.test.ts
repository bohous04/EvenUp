import { beforeEach, describe, expect, it } from 'vitest';
import { exportPKCS8, generateKeyPair } from 'jose';
import { buildSocialProviders, type AppleConfig, type GoogleConfig } from './social-providers.js';
import { initAppleClientSecret, __resetAppleSecretForTests } from './apple-secret.js';

const GOOGLE: GoogleConfig = { clientId: 'google-client-id', clientSecret: 'google-client-secret' };

async function makeAppleConfig(): Promise<AppleConfig> {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  return {
    servicesId: 'company.lnrt.evenup.web', // the *web* OAuth client id (Services ID)
    teamId: 'TEAM123456',
    keyId: 'KEY7890AB',
    privateKey: await exportPKCS8(privateKey),
    bundleId: 'company.lnrt.evenup', // the *iOS* App ID — distinct from servicesId
  };
}

describe('buildSocialProviders', () => {
  beforeEach(() => {
    __resetAppleSecretForTests();
  });

  it('returns undefined when neither provider is configured', () => {
    expect(buildSocialProviders(null, null)).toBeUndefined();
  });

  it('returns only google when apple is not configured', () => {
    const result = buildSocialProviders(GOOGLE, null);
    expect(result).toBeDefined();
    expect(Object.keys(result ?? {})).toEqual(['google']);
  });

  it('returns only apple when google is not configured', async () => {
    const apple = await makeAppleConfig();
    await initAppleClientSecret(apple);
    const result = buildSocialProviders(null, apple);
    expect(result).toBeDefined();
    expect(Object.keys(result ?? {})).toEqual(['apple']);
  });

  it('returns both when both providers are configured', async () => {
    const apple = await makeAppleConfig();
    await initAppleClientSecret(apple);
    const result = buildSocialProviders(GOOGLE, apple);
    expect(result).toBeDefined();
    expect(Object.keys(result ?? {}).sort()).toEqual(['apple', 'google']);
  });

  describe('the apple clientSecret property', () => {
    it('is a getter, not a plain value — the regression barrier for this fix', async () => {
      const apple = await makeAppleConfig();
      await initAppleClientSecret(apple);
      const result = buildSocialProviders(null, apple);

      const desc = Object.getOwnPropertyDescriptor(result?.apple, 'clientSecret');
      expect(desc).toBeDefined();
      expect(typeof desc?.get).toBe('function');
      // A data property (`clientSecret: appleClientSecret()`) would have a
      // `value` here instead of a `get`; an accessor property never does.
      expect(desc?.value).toBeUndefined();
    });

    it('returns a string, never a Promise', async () => {
      const apple = await makeAppleConfig();
      await initAppleClientSecret(apple);
      const result = buildSocialProviders(null, apple);

      const secret = result?.apple?.clientSecret;
      expect(typeof secret).toBe('string');
      expect(secret).not.toHaveProperty('then');
    });
  });

  it('routes mapProfileToUser through appleDisplayName', async () => {
    const apple = await makeAppleConfig();
    await initAppleClientSecret(apple);
    const result = buildSocialProviders(null, apple);

    // An empty name with a relay email must fall through to the local-part,
    // never surface as the literal empty string appleDisplayName exists to avoid.
    const mapped = result?.apple?.mapProfileToUser({
      name: '',
      email: 'x7k2m9p4qz@privaterelay.appleid.com',
    });
    expect(mapped).toEqual({ name: 'x7k2m9p4qz' });
  });

  it('keeps appBundleIdentifier and clientId as the distinct identifiers they are', async () => {
    const apple = await makeAppleConfig();
    await initAppleClientSecret(apple);
    const result = buildSocialProviders(null, apple);

    expect(result?.apple?.appBundleIdentifier).toBe('company.lnrt.evenup');
    expect(result?.apple?.clientId).toBe('company.lnrt.evenup.web');
    expect(result?.apple?.clientId).not.toBe(result?.apple?.appBundleIdentifier);
  });
});
