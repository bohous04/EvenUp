import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT, decodeJwt, decodeProtectedHeader, exportPKCS8, generateKeyPair } from 'jose';
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

  it("never exceeds Apple's maximum secret lifetime", async () => {
    const cfg = await makeConfig();
    const claims = decodeJwt(await mintAppleClientSecret(cfg, 1_800_000_000));
    expect(claims.iat).toBe(1_800_000_000);
    // Pin the exact mint lifetime (150 days) so a regression to any other
    // in-range value (e.g. 10 days) can't pass silently.
    expect(claims.exp! - claims.iat!).toBe(150 * 24 * 60 * 60);
    // Still document the Apple constraint the exact value above must respect.
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

describe('appleClientSecret refresh-on-read', () => {
  // The module reads Date.now() internally; there is no clock seam, so these
  // tests age the module's cache by moving vitest's fake system clock instead.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const START = new Date('2024-01-01T00:00:00Z');

  beforeEach(() => {
    __resetAppleSecretForTests();
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    // Must not leak fake timers into the other 8 tests in this file (or any
    // other test file in the same worker).
    vi.useRealTimers();
    // Restore any spies (e.g. SignJWT.prototype.sign, console.error) even if
    // an assertion earlier in the test threw before an inline mockRestore().
    vi.restoreAllMocks();
  });

  it('does not refresh before the 120-day threshold (negative control)', async () => {
    const cfg = await makeConfig();
    await initAppleClientSecret(cfg);
    const original = appleClientSecret();

    // `SignJWT.prototype` is a plain, mutable object (unlike jose's ES module
    // namespace, which vitest cannot spy on — "Module namespace is not
    // configurable in ESM"), and every mint calls `.sign()` exactly once, so
    // this is a reliable, seam-free way to count mint attempts from the test.
    const signSpy = vi.spyOn(SignJWT.prototype, 'sign');
    vi.setSystemTime(new Date(START.getTime() + 119 * DAY_MS));

    expect(appleClientSecret()).toBe(original);
    expect(signSpy).not.toHaveBeenCalled();
  });

  it('fires a re-mint past the 120-day threshold and eventually serves the new token', async () => {
    const cfg = await makeConfig();
    await initAppleClientSecret(cfg);
    const original = appleClientSecret();

    vi.setSystemTime(new Date(START.getTime() + 121 * DAY_MS));
    // Crosses the threshold and kicks off the fire-and-forget re-mint.
    appleClientSecret();

    // The re-mint is a real (fake-timer-independent) async jose operation, so
    // let its microtask/promise chain settle. vi.waitFor polls on vitest's
    // "safe" (real, unfaked) timers internally, so this does not deadlock
    // even though fake timers are active in this test.
    await vi.waitFor(() => {
      expect(appleClientSecret()).not.toBe(original);
    });
  });

  it('keeps serving the still-valid stale token and logs when the re-mint rejects', async () => {
    const cfg = await makeConfig();
    await initAppleClientSecret(cfg);
    const original = appleClientSecret();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // `cfg` is the exact object `initAppleClientSecret` stored as the module's
    // config, so corrupting it here makes the next re-mint attempt reject
    // without needing any new export or seam in the production module.
    cfg.privateKey = 'not-a-key';

    vi.setSystemTime(new Date(START.getTime() + 121 * DAY_MS));
    expect(appleClientSecret()).toBe(original);

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalled();
    });
    // The stale-but-still-valid token was already proven to be served above,
    // synchronously, before the failed re-mint even settled — that is the
    // fail-open guarantee. A second post-settlement read is intentionally not
    // taken here: it would cross the still-past-threshold clock again and
    // kick off an uncontrolled second re-mint (also rejecting, also logging
    // asynchronously) that could outlive this test's mocks.
    expect(errorSpy.mock.calls[0]?.[0]).toMatch(/apple client secret re-mint failed/i);
  });

  it('the refreshing guard prevents a pile-up: two reads past the threshold trigger exactly one re-mint', async () => {
    const cfg = await makeConfig();
    await initAppleClientSecret(cfg);
    const original = appleClientSecret();

    const signSpy = vi.spyOn(SignJWT.prototype, 'sign');
    vi.setSystemTime(new Date(START.getTime() + 121 * DAY_MS));

    // Both reads land while the re-mint is in flight, so both must still
    // serve the old token — `cache` is only replaced once the mint resolves.
    expect(appleClientSecret()).toBe(original);
    expect(appleClientSecret()).toBe(original);

    // The mint's first `await` point (inside importPKCS8, before .sign() is
    // ever reached) is entered synchronously inside each appleClientSecret()
    // call, and the `refreshing` guard is set before that — so by the time
    // the re-mint eventually calls .sign(), a second concurrent mint has
    // already been suppressed. A spy only records invocation, not
    // resolution, and the sign is a real async WebCrypto op — so wait for
    // the *effect* (a later read observing a new token), exactly like the
    // sibling test above, rather than the call. That guarantees the whole
    // `.then()`/`.catch()`/`.finally()` chain inside appleClientSecret() has
    // drained — including the `cache` swap and the `refreshing = false`
    // reset — before this test ends. Waiting only for the call would let
    // that chain dangle past the test body and mutate the shared
    // module-level `cache`/`refreshing` state on a later, indeterminate
    // tick, potentially corrupting a following test.
    await vi.waitFor(() => {
      expect(appleClientSecret()).not.toBe(original);
    });
    expect(signSpy).toHaveBeenCalledTimes(1);
  });
});
