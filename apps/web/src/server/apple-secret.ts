/**
 * Apple's OAuth `client_secret` is not a static string: it is an ES256 JWT
 * signed with a `.p8` key, and Apple caps its lifetime at ~182.6 days. We mint
 * it at runtime and re-mint before expiry, so a long-lived deployment never
 * wakes up to an opaque `invalid_client`.
 */
import 'server-only';
import { SignJWT, importPKCS8 } from 'jose';

/** Apple's hard cap on `client_secret` lifetime, in seconds (~182.6 days). */
export const APPLE_MAX_SECRET_LIFETIME_SEC = 15_777_000;

/** Mint for 150 days — comfortable headroom under the cap. */
const LIFETIME_SEC = 150 * 24 * 60 * 60;
/** Re-mint once the cached token is older than 120 days. */
const REFRESH_AFTER_SEC = 120 * 24 * 60 * 60;

const APPLE_AUDIENCE = 'https://appleid.apple.com';

export interface AppleSecretConfig {
  /** Apple Developer Team ID — the JWT `iss`. */
  teamId: string;
  /** Key ID of the `.p8` signing key — the JWT header `kid`. */
  keyId: string;
  /** Services ID (the web OAuth client id) — the JWT `sub`. */
  servicesId: string;
  /** PKCS8 PEM contents of the `.p8`; may arrive with `\n` escaped. */
  privateKey: string;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Env transports flatten newlines; restore them before parsing the PEM. */
export function normalizePrivateKey(pem: string): string {
  return pem.replace(/\\n/g, '\n').trim();
}

export async function mintAppleClientSecret(
  cfg: AppleSecretConfig,
  nowSec: number = nowSeconds(),
): Promise<string> {
  const key = await importPKCS8(normalizePrivateKey(cfg.privateKey), 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: cfg.keyId })
    .setIssuer(cfg.teamId)
    .setAudience(APPLE_AUDIENCE)
    .setSubject(cfg.servicesId)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + LIFETIME_SEC)
    .sign(key);
}

let config: AppleSecretConfig | null = null;
let cache: { token: string; mintedAtSec: number } | null = null;
let refreshing = false;

/**
 * Mint the first token. Called once, with top-level `await`, before the Better
 * Auth provider is constructed — so `appleClientSecret()` is never cold.
 * Throws on an unparseable key, failing the boot rather than the first sign-in.
 */
export async function initAppleClientSecret(cfg: AppleSecretConfig): Promise<void> {
  config = cfg;
  cache = { token: await mintAppleClientSecret(cfg), mintedAtSec: nowSeconds() };
}

/**
 * Synchronous by contract: Better Auth reads `options.clientSecret` on every
 * token exchange and drops it straight into the request body. Returning a
 * Promise here would send the literal string `[object Promise]` to Apple.
 */
export function appleClientSecret(): string {
  if (!cache || !config) {
    throw new Error('Apple client secret is not initialized; call initAppleClientSecret() first.');
  }
  if (nowSeconds() - cache.mintedAtSec > REFRESH_AFTER_SEC && !refreshing) {
    refreshing = true;
    const cfg = config;
    void mintAppleClientSecret(cfg)
      .then((token) => {
        cache = { token, mintedAtSec: nowSeconds() };
      })
      .catch(() => {
        // Keep serving the current token: it is still valid for ~30 more days.
      })
      .finally(() => {
        refreshing = false;
      });
  }
  return cache.token;
}

/** @internal test seam */
export function __resetAppleSecretForTests(): void {
  config = null;
  cache = null;
  refreshing = false;
}
