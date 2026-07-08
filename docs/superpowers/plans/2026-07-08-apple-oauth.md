# Apple Sign In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Sign In with Apple on the EvenUp web app (OAuth redirect) and the Expo iOS app (native sheet), closing PRD FR-1.2.

**Architecture:** Better Auth gains an `apple` social provider whose `clientSecret` is an ES256 JWT minted at runtime from a `.p8` key and re-minted before Apple's ~182-day cap. The web surface uses the standard OAuth redirect against a Services ID; iOS uses `expo-apple-authentication` to obtain an `idToken` verified against the app's bundle ID. Account linking is enabled so a verified Apple email folds into an existing magic-link user.

**Tech Stack:** Better Auth 1.6.20 (`@better-auth/core`), `jose` (ES256 JWT), Next.js 15 + React 19, Expo SDK 52 (`expo-apple-authentication`, `expo-crypto`), vitest 3, pnpm workspaces + turbo.

**Spec:** [`docs/superpowers/specs/2026-07-08-apple-oauth-design.md`](../specs/2026-07-08-apple-oauth-design.md)

## Global Constraints

- **Better Auth is 1.6.20, not the `^1.2.9` in `package.json`.** Providers live in `@better-auth/core/src/social-providers/apple.ts`. Do not implement against 1.2.9 docs.
- **Apple's `client_secret` lifetime cap is `15777000` seconds (~182.6 days).** Mint for 150 days; refresh after 120.
- **`clientSecret` must be a getter returning a `string`, never a `Promise`.** Better Auth reads `options.clientSecret` per request and interpolates it into the token-request body; a Promise becomes `[object Promise]`.
- **Never use an emoji glyph for an icon.** Use an SVG icon component. `lucide-react`'s `Apple` export is a **fruit** (it has a stem path) — never use it for Sign In with Apple. Apple's HIG requires the official logo mark.
- **Every user-facing string needs both CZ and EN.** `packages/i18n/src/locales/cs.ts` is the source of truth for the `Messages` type, and `packages/i18n/src/i18n.test.ts:19` enforces exact key parity across locales. Adding a key to one locale without the other fails the suite.
- **Imports use explicit `.js` extensions** even though `moduleResolution` is `Bundler` (see `apps/web/src/server/auth.ts:9` → `./env.js`). Follow it.
- **Do NOT add a `Co-Authored-By: Claude` trailer, or any Claude/Anthropic co-author line, to any commit.** The user's global `CLAUDE.md` forbids it and overrides any default.
- Apple rejects `localhost` and non-HTTPS return URLs. Nothing in this plan can be exercised end-to-end locally or in CI; unit tests cover the minter and the profile mapper, and nothing else.

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/web/vitest.config.ts` *(new)* | vitest project for `apps/web` (first unit tests in this workspace) |
| `apps/web/src/test/server-only.stub.ts` *(new)* | Neutralizes `import 'server-only'` under vitest |
| `apps/web/src/server/apple-secret.ts` *(new)* | Mint + cache + refresh the Apple `client_secret` JWT |
| `apps/web/src/server/apple-profile.ts` *(new)* | Map an Apple profile to a never-empty display name |
| `apps/web/src/server/env.ts` | Add the optional `apple` config block |
| `apps/web/src/server/auth.ts` | Wire the provider, `trustedOrigins`, `accountLinking` |
| `apps/web/src/components/icons.tsx` | `AppleLogo` SVG icon component |
| `apps/web/src/components/sign-in.tsx` | Apple button, gated on `NEXT_PUBLIC_APPLE_ENABLED` |
| `packages/i18n/src/locales/{cs,en}.ts` | `auth.continueApple` |
| `infra/docker/Dockerfile`, `docker-compose.yml` | Plumb `NEXT_PUBLIC_*` build args (see Task 6 note) |
| `.env.example`, `docs/SELF_HOSTING.md` | Operator-facing config + portal walkthrough |
| `apps/mobile/src/lib/apple-sign-in.ts` *(new)* | Nonce + native credential → `signIn.social` + name backfill |
| `apps/mobile/app/sign-in.tsx` | Render the native Apple button on iOS |

Two files rather than one on the server side: `apple-secret.ts` is crypto with a cache and a clock; `apple-profile.ts` is a pure string function. They change for different reasons and test differently.

---

## Task 1: Apple client-secret minter (+ vitest for `apps/web`)

**Files:**
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test/server-only.stub.ts`
- Create: `apps/web/src/server/apple-secret.ts`
- Test: `apps/web/src/server/apple-secret.test.ts`
- Modify: `apps/web/package.json` (scripts + `jose` dep + vitest devDeps)

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `APPLE_MAX_SECRET_LIFETIME_SEC: number` (= `15_777_000`)
  - `interface AppleSecretConfig { teamId: string; keyId: string; servicesId: string; privateKey: string }`
  - `normalizePrivateKey(pem: string): string`
  - `mintAppleClientSecret(cfg: AppleSecretConfig, nowSec?: number): Promise<string>`
  - `initAppleClientSecret(cfg: AppleSecretConfig): Promise<void>`
  - `appleClientSecret(): string` — sync; throws if not initialized
  - `__resetAppleSecretForTests(): void`

`apps/web` has no unit tests today. `import 'server-only'` resolves to a module that unconditionally `throw`s unless the `react-server` export condition is active (verified in `node_modules/server-only/package.json`), so vitest must alias it away.

- [ ] **Step 1: Add dependencies and test scripts**

```bash
pnpm --filter @evenup/web add jose@^6.2.3
pnpm --filter @evenup/web add -D vitest@^3.0.5 @vitest/coverage-v8@^3.0.5
```

Then add to the `"scripts"` block of `apps/web/package.json`, after `"typecheck"`:

```json
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
```

- [ ] **Step 2: Create the `server-only` stub**

`apps/web/src/test/server-only.stub.ts`:

```ts
/**
 * `server-only` throws on import unless Next.js activates the `react-server`
 * export condition. Under vitest it does not, so we alias the package to this
 * no-op module. See apps/web/vitest.config.ts.
 */
export {};
```

- [ ] **Step 3: Create the vitest config**

`apps/web/vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws when imported outside a React Server Component.
      'server-only': fileURLToPath(new URL('./src/test/server-only.stub.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write the failing test**

`apps/web/src/server/apple-secret.test.ts`:

```ts
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
```

- [ ] **Step 5: Run the test and confirm it fails**

```bash
pnpm --filter @evenup/web test
```

Expected: FAIL — `Failed to resolve import "./apple-secret.js"`.

- [ ] **Step 6: Implement the minter**

`apps/web/src/server/apple-secret.ts`:

```ts
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
 * Throws on an unparseable key. NOTE: `auth.ts` catches this and disables Apple
 * rather than letting it propagate — see Task 3. A top-level `await` that rejects
 * makes `auth.ts` an async module that never evaluates, taking all of `/api/auth/*`
 * down with it (magic link and Google included).
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
```

- [ ] **Step 7: Run the tests and confirm they pass**

```bash
pnpm --filter @evenup/web test
```

Expected: PASS — 8 tests. Also run `pnpm --filter @evenup/web typecheck` (expect no errors).

- [ ] **Step 8: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/src/test/server-only.stub.ts \
        apps/web/src/server/apple-secret.ts apps/web/src/server/apple-secret.test.ts \
        apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): runtime-minted Apple client secret + vitest for apps/web"
```

---

## Task 2: Never-empty Apple display name

**Files:**
- Create: `apps/web/src/server/apple-profile.ts`
- Test: `apps/web/src/server/apple-profile.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `appleDisplayName(profile: { name?: string | null; email?: string | null }): string`

Apple's id_token has **no `name` claim**. Better Auth falls back to `profile.name || ""` (`@better-auth/core/src/social-providers/apple.ts:191-199`, with their own `TODO` about the `""` masking). On the native `idToken` path `token.user` is always absent, so every iOS Apple user would be stored with an empty name and render blank across EvenUp's group lists.

- [ ] **Step 1: Write the failing test**

`apps/web/src/server/apple-profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { appleDisplayName } from './apple-profile.js';

describe('appleDisplayName', () => {
  it('prefers the name Apple supplied', () => {
    expect(appleDisplayName({ name: 'Alice Smith', email: 'alice@example.com' })).toBe('Alice Smith');
  });

  it('trims surrounding whitespace', () => {
    expect(appleDisplayName({ name: '  Alice Smith  ', email: null })).toBe('Alice Smith');
  });

  it('falls back to the email local-part when Apple omits the name', () => {
    expect(appleDisplayName({ name: '', email: 'alice@example.com' })).toBe('alice');
  });

  it('falls back for a whitespace-only name', () => {
    expect(appleDisplayName({ name: '   ', email: 'alice@example.com' })).toBe('alice');
  });

  it('handles a null name', () => {
    expect(appleDisplayName({ name: null, email: 'alice@example.com' })).toBe('alice');
  });

  it('uses the relay local-part for a hidden-email user', () => {
    expect(appleDisplayName({ name: '', email: 'x7k2m9p4qz@privaterelay.appleid.com' })).toBe('x7k2m9p4qz');
  });

  it('never returns an empty string when both name and email are missing', () => {
    expect(appleDisplayName({ name: '', email: '' })).toBe('EvenUp user');
    expect(appleDisplayName({})).toBe('EvenUp user');
  });

  it('never returns an empty string for a malformed email', () => {
    expect(appleDisplayName({ name: '', email: '@example.com' })).toBe('EvenUp user');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
pnpm --filter @evenup/web test apple-profile
```

Expected: FAIL — `Failed to resolve import "./apple-profile.js"`.

- [ ] **Step 3: Implement**

`apps/web/src/server/apple-profile.ts`:

```ts
/**
 * Apple's id_token carries no `name` claim — the name arrives only in the web
 * form_post `user` parameter, and only on the user's first-ever consent. On the
 * native idToken path it is never present, and Better Auth would store `""`.
 * EvenUp shows member names throughout group lists, so an empty name is loud.
 */
import 'server-only';

const FALLBACK_NAME = 'EvenUp user';

export function appleDisplayName(profile: { name?: string | null; email?: string | null }): string {
  const name = profile.name?.trim();
  if (name) return name;

  const localPart = profile.email?.trim().split('@')[0]?.trim();
  if (localPart) return localPart;

  return FALLBACK_NAME;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
pnpm --filter @evenup/web test
```

Expected: PASS — 16 tests across both files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/apple-profile.ts apps/web/src/server/apple-profile.test.ts
git commit -m "feat(web): never store an empty display name for Apple sign-ups"
```

---

## Task 3: Wire the provider into Better Auth

**Files:**
- Modify: `apps/web/src/server/env.ts:46-49` (after the `google` block)
- Modify: `apps/web/src/server/auth.ts` (whole file)

**Interfaces:**
- Consumes: `initAppleClientSecret`, `appleClientSecret`, `AppleSecretConfig` (Task 1); `appleDisplayName` (Task 2).
- Produces: `auth` (unchanged export), now with an `apple` provider when configured.

There are no unit tests for this task — it is configuration whose only observable behavior requires Apple. It is verified by `typecheck`, by the existing Playwright suite staying green, and by manual staging checks (Task 7).

- [ ] **Step 1: Add the `apple` block to `env.ts`**

In `apps/web/src/server/env.ts`, immediately after the `google: { ... },` block (line 46-49):

```ts
  /**
   * Sign In with Apple. `servicesId` is the Services ID (the *web* OAuth client
   * id); `bundleId` is the iOS App ID, used only to validate native id_tokens.
   * They are different identifiers and are not interchangeable.
   */
  apple: {
    servicesId: process.env.APPLE_SERVICES_ID,
    bundleId: process.env.APPLE_BUNDLE_ID ?? 'company.lnrt.evenup',
    teamId: process.env.APPLE_TEAM_ID,
    keyId: process.env.APPLE_KEY_ID,
    privateKey: process.env.APPLE_PRIVATE_KEY,
  },
```

- [ ] **Step 2: Rewrite `auth.ts` to build both providers**

Replace `apps/web/src/server/auth.ts` in full:

```ts
/** Better Auth server instance (PRD §8.2): email magic link + optional Google / Apple. */
import 'server-only';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { magicLink, bearer } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { expo } from '@better-auth/expo';
import { prisma } from '@evenup/db';
import { env } from './env.js';
import { rememberMagicLink } from './magic-link-store.js';
import { sendEmail, magicLinkEmail } from './email.js';
import { appleClientSecret, initAppleClientSecret } from './apple-secret.js';
import { appleDisplayName } from './apple-profile.js';

const googleProvider =
  env.google.clientId && env.google.clientSecret
    ? { google: { clientId: env.google.clientId, clientSecret: env.google.clientSecret } }
    : undefined;

const { servicesId, teamId, keyId, privateKey, bundleId } = env.apple;
// Build the config in one narrowing step, so `servicesId` et al. are `string`
// below without non-null assertions.
let appleSecret =
  servicesId && teamId && keyId && privateKey
    ? { servicesId, teamId, keyId, privateKey }
    : null;

// Mint the first client secret before the provider is constructed.
//
// Fail SOFT, not fast. `auth.ts` has a top-level `await`, which makes it an async
// module: if this rejects, every importer fails to evaluate and ALL of
// `/api/auth/*` returns 500 — magic link and Google included — logging only
// `InvalidCharacterError: Invalid character`. Apple is optional; a typo in its key
// must not break the auth everyone else uses. Verified against a production build.
if (appleSecret) {
  try {
    await initAppleClientSecret(appleSecret);
  } catch (error) {
    console.error(
      'APPLE_PRIVATE_KEY could not be parsed as a PKCS8 ES256 key. ' +
        'Sign In with Apple is DISABLED; other sign-in methods are unaffected.',
      error,
    );
    appleSecret = null; // provider is not registered → 404 PROVIDER_NOT_FOUND
  }
}

const appleProvider = appleSecret
  ? {
      apple: {
        clientId: appleSecret.servicesId,
        // A getter, not a value: Better Auth reads `options.clientSecret` on
        // every token exchange, which is what lets the JWT refresh in place.
        get clientSecret() {
          return appleClientSecret();
        },
        // Audience for validating *native* id_tokens only; the web callback
        // decodes its id_token without an audience check.
        appBundleIdentifier: bundleId,
        mapProfileToUser: (profile: { name?: string | null; email?: string | null }) => ({
          name: appleDisplayName(profile),
        }),
      },
    }
  : undefined;

const socialProviders =
  googleProvider || appleProvider ? { ...googleProvider, ...appleProvider } : undefined;

export const auth = betterAuth({
  baseURL: env.authUrl,
  secret: env.authSecret,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: false },
  // Rate limiting protects auth in production (§9.2); disabled in dev/E2E so the
  // test suite's rapid repeated sign-ins aren't throttled.
  rateLimit: { enabled: !env.authDevEcho },
  trustedOrigins: [
    'evenup://', // the Expo app's deep-link scheme (FR-1.5)
    'https://appleid.apple.com', // Apple form_posts the callback cross-origin
  ],
  // Link a social account into an existing user when the provider vouches for
  // the email. Apple and Google both send `email_verified`, so no
  // `trustedProviders` — that would force-link *unverified* emails.
  account: { accountLinking: { enabled: true } },
  socialProviders,
  plugins: [
    // Native deep-link session handoff for the Expo app: appends the session
    // cookie to the evenup:// redirect after magic-link verify so the client
    // can store it (without this, the app bounces back to sign-in). FR-1.5.
    expo(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        if (env.authDevEcho) rememberMagicLink(email, url); // local/E2E sign-in
        await sendEmail(magicLinkEmail(email, url));
      },
    }),
    bearer(), // token auth for the mobile app (Expo client stores it in secure storage)
    nextCookies(), // must be last
  ],
});

export type Session = typeof auth.$Infer.Session;
```

- [ ] **Step 3: Typecheck and confirm the existing E2E suite still passes**

```bash
pnpm --filter @evenup/web typecheck
pnpm --filter @evenup/web lint
```

Expected: no errors. Then, with no `APPLE_*` env set (so `appleSecret` is `null` and the top-level `await` is skipped):

```bash
pnpm --filter @evenup/web build
```

Expected: build succeeds. The top-level `await` in `auth.ts` requires an ESM output target; if `next build` reports "Top-level await is not available", the fallback is to move the `await` into a lazily-awaited module-scope promise consumed by the getter. Verify before assuming.

**A build with `APPLE_*` unset proves almost nothing** — the awaited branch never runs. Exercise it for real (done 2026-07-08; results recorded in `.superpowers/sdd/task-3-report.md`):

```bash
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out /tmp/k.pem   # a valid PKCS8 ES256 key
# set APPLE_SERVICES_ID / APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY (newlines as literal \n)
pnpm --filter @evenup/web build && pnpm --filter @evenup/web start
curl -X POST localhost:3000/api/auth/sign-in/social -H 'Content-Type: application/json' \
  -d '{"provider":"apple","callbackURL":"/"}'
```

Expect `200` and a JSON `{"url":"https://appleid.apple.com/auth/authorize?...client_id=<your Services ID>..."}`. This is the strongest available proof short of Apple itself: `createAuthorizationURL` throws `CLIENT_ID_AND_SECRET_REQUIRED` unless `options.clientSecret` is truthy, so a returned URL means **the getter fired and produced a real string** — not `[object Promise]`.

Then repeat with a deliberately malformed `APPLE_PRIVATE_KEY` and assert the fail-soft contract: `GET /api/auth/get-session` → **200**, `POST /api/auth/sign-in/social {provider:apple}` → **404 `PROVIDER_NOT_FOUND`**, magic-link sign-in → **200**, and the log names `APPLE_PRIVATE_KEY`.

- [ ] **Step 4: Run the full E2E suite**

```bash
pnpm --filter @evenup/web test:e2e
```

Expected: PASS — 28 tests (7 specs × 4 browser projects), unchanged (Apple button is not rendered; `NEXT_PUBLIC_APPLE_ENABLED` is unset).

Note: `accountLinking.enabled` was previously `false` (default). Confirm the magic-link flows in the suite still pass — this change also affects Google.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/env.ts apps/web/src/server/auth.ts
git commit -m "feat(web): Apple social provider + verified-email account linking

Enabling accountLinking also fixes the pre-existing ACCOUNT_NOT_LINKED
dead-end that a magic-link user hit when clicking Continue with Google."
```

---

## Task 4: Web sign-in button + CZ/EN strings

**Files:**
- Modify: `packages/i18n/src/locales/cs.ts:25` (after `auth.continueGoogle`)
- Modify: `packages/i18n/src/locales/en.ts:25` (after `auth.continueGoogle`)
- Modify: `apps/web/src/components/icons.tsx` (add `AppleLogo`)
- Modify: `apps/web/src/components/sign-in.tsx:8-10, 71-88`

**Interfaces:**
- Consumes: nothing from earlier tasks (the button calls `signIn.social`, which already exists).
- Produces: `AppleLogo({ size }: { size?: number }): JSX.Element` from `@/components/icons`; i18n key `auth.continueApple`.

`packages/i18n/src/i18n.test.ts:19` asserts exact key parity across locales, so both files must change together or the suite fails.

- [ ] **Step 1: Add the CZ string (source of truth for the `Messages` type)**

In `packages/i18n/src/locales/cs.ts`, directly after the `'auth.continueGoogle'` line:

```ts
  'auth.continueApple': 'Pokračovat přes Apple',
```

- [ ] **Step 2: Add the EN string**

In `packages/i18n/src/locales/en.ts`, directly after the `'auth.continueGoogle'` line:

```ts
  'auth.continueApple': 'Continue with Apple',
```

- [ ] **Step 3: Run the i18n suite to confirm parity holds**

```bash
pnpm --filter @evenup/i18n test
```

Expected: PASS — 19 tests, including "every locale defines exactly the same keys as Czech".

- [ ] **Step 4: Add the `AppleLogo` icon**

`lucide-react` exports an `Apple` icon, but it is **the fruit** — it has a stem path. Apple's HIG requires the official logo mark, so inline it. In `apps/web/src/components/icons.tsx`, add above the final `export { ... }` line:

```tsx
/**
 * The Apple logo mark, required by Apple's Human Interface Guidelines for the
 * Sign In with Apple button. Not `lucide-react`'s `Apple` export — that is a
 * piece of fruit.
 */
export function AppleLogo({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 384 512"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}
```

- [ ] **Step 5: Render the Apple button**

In `apps/web/src/components/sign-in.tsx`, change the import on line 6 to pull in the new icon:

```tsx
import { Mail, AppleLogo } from '@/components/icons';
```

Add the feature flag beside `googleEnabled` (line 10):

```tsx
const appleEnabled = process.env.NEXT_PUBLIC_APPLE_ENABLED === 'true';
```

Replace the whole `{googleEnabled ? ( ... ) : null}` block (lines 71-88) with:

```tsx
            {googleEnabled || appleEnabled ? (
              <>
                <div className="flex items-center gap-3 text-xs text-neutral-400">
                  <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
                  {t('common.or')}
                  <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
                </div>
                {googleEnabled ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => signIn.social({ provider: 'google', callbackURL: '/' })}
                    data-testid="google-signin"
                  >
                    {t('auth.continueGoogle')}
                  </Button>
                ) : null}
                {appleEnabled ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex w-full items-center justify-center gap-2"
                    onClick={() => signIn.social({ provider: 'apple', callbackURL: '/' })}
                    data-testid="apple-signin"
                  >
                    <AppleLogo size={16} />
                    {t('auth.continueApple')}
                  </Button>
                ) : null}
              </>
            ) : null}
```

The divider now renders when *either* provider is enabled, instead of being welded to Google.

- [ ] **Step 6: Verify**

```bash
pnpm --filter @evenup/web typecheck && pnpm --filter @evenup/web lint
pnpm --filter @evenup/web test:e2e
```

Expected: typecheck/lint clean; E2E still 28/28 (neither flag is set in the E2E env, so no divider and no social buttons).

- [ ] **Step 7: Commit**

```bash
git add packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts \
        apps/web/src/components/icons.tsx apps/web/src/components/sign-in.tsx
git commit -m "feat(web): Continue with Apple button + CZ/EN strings"
```

---

## Task 5: Operator config — env, Docker, docs

**Files:**
- Modify: `.env.example:18-22` (**replace** the existing `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` stubs)
- Modify: `infra/docker/Dockerfile:25-32` (build stage)
- Modify: `docker-compose.yml:38-59` (build args + environment)
- Modify: `docs/SELF_HOSTING.md:40`

**Interfaces:**
- Consumes: the env names from Task 3 (`APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_BUNDLE_ID`) and `NEXT_PUBLIC_APPLE_ENABLED` from Task 4.
- Produces: nothing consumed by later tasks.

**Two pre-existing problems this task fixes.**

1. `.env.example` already ships `APPLE_CLIENT_ID=` / `APPLE_CLIENT_SECRET=` placeholders that nothing reads and that are the wrong shape for this design. **Replace them; do not append.**
2. `NEXT_PUBLIC_*` is inlined by `next build`, not read at runtime — but `docker-compose.yml` passes no `build.args` and does not even list `NEXT_PUBLIC_GOOGLE_ENABLED` under `environment:`, and `infra/docker/Dockerfile` declares no `ARG`. **So a self-hoster following `docker compose build` never gets a Google button**, and Apple would inherit that exactly.

> **Verified 2026-07-08, do not "fix" what isn't broken:** Coolify production
> *does* render the Google button. Its `NEXT_PUBLIC_GOOGLE_ENABLED` is marked
> `is_buildtime: true`, and Coolify injects build-time vars into Dockerfile
> builds on its own (the prod bundle has the ternary folded away and the button
> rendered unconditionally — checked against
> `https://evenup.lnrtdev.cz/_next/static/chunks/app/page-*.js`). Adding the
> explicit `ARG` is still correct: it makes plain `docker compose build` behave
> the same as Coolify, and it documents the build-time contract. But it is **not**
> repairing a broken production deploy.

- [ ] **Step 1: Replace the Apple stubs in `.env.example`**

Replace lines 18-22 (the `# OAuth providers (optional)...` block through `APPLE_CLIENT_SECRET=`) with:

```bash
# OAuth providers (optional). Apple required for iOS App Store.
# NEXT_PUBLIC_* are inlined at BUILD time — set them before `next build`.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_GOOGLE_ENABLED=

# Sign In with Apple. Requires a paid Apple Developer Program membership.
# APPLE_SERVICES_ID is the Services ID (web OAuth client), NOT the bundle id.
# APPLE_PRIVATE_KEY is the contents of the AuthKey_XXXXXXXXXX.p8 file; newlines
# may be written as literal \n. The .p8 can only be downloaded once.
APPLE_SERVICES_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
APPLE_BUNDLE_ID=company.lnrt.evenup
NEXT_PUBLIC_APPLE_ENABLED=
```

- [ ] **Step 2: Accept the public flags as build args in the Dockerfile**

In `infra/docker/Dockerfile`, replace lines 25-32 with:

```dockerfile
# ---------- build ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* are inlined into the client bundle by `next build`, so they must
# be present at build time — not merely in the runtime environment.
ARG NEXT_PUBLIC_GOOGLE_ENABLED=""
ARG NEXT_PUBLIC_APPLE_ENABLED=""
ENV NEXT_PUBLIC_GOOGLE_ENABLED=$NEXT_PUBLIC_GOOGLE_ENABLED
ENV NEXT_PUBLIC_APPLE_ENABLED=$NEXT_PUBLIC_APPLE_ENABLED
# Generate the Prisma client, then build the Next standalone bundle.
RUN pnpm --filter @evenup/db exec prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @evenup/web build
```

- [ ] **Step 3: Pass the build args and runtime env in `docker-compose.yml`**

Replace the `build:` block (lines 39-41) with:

```yaml
    build:
      context: .
      dockerfile: infra/docker/Dockerfile
      args:
        NEXT_PUBLIC_GOOGLE_ENABLED: ${NEXT_PUBLIC_GOOGLE_ENABLED:-}
        NEXT_PUBLIC_APPLE_ENABLED: ${NEXT_PUBLIC_APPLE_ENABLED:-}
```

And after the two `GOOGLE_CLIENT_*` lines in `environment:` (lines 56-57), add:

```yaml
      APPLE_SERVICES_ID: ${APPLE_SERVICES_ID:-}
      APPLE_TEAM_ID: ${APPLE_TEAM_ID:-}
      APPLE_KEY_ID: ${APPLE_KEY_ID:-}
      APPLE_PRIVATE_KEY: ${APPLE_PRIVATE_KEY:-}
      APPLE_BUNDLE_ID: ${APPLE_BUNDLE_ID:-company.lnrt.evenup}
```

- [ ] **Step 4: Document the portal setup**

In `docs/SELF_HOSTING.md`, replace the single `GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET` bullet (line 40) with:

```markdown
- **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`** — optional Google sign-in. Also
  set **`NEXT_PUBLIC_GOOGLE_ENABLED=true`** to render the button — it is inlined
  at **build** time, so it must be set before `next build` (Docker: a build arg).
- **`APPLE_*`** — optional Sign In with Apple; **required if you ship the iOS app**
  (PRD FR-1.2). Needs a paid Apple Developer Program membership. In the portal:
  1. Enable **Sign In with Apple** on the App ID `company.lnrt.evenup`.
  2. Create a **Services ID** (e.g. `company.lnrt.evenup.web`) → `APPLE_SERVICES_ID`.
     Register your domain and the return URL `https://<your-host>/api/auth/callback/apple`.
     Apple rejects `localhost` and plain `http`, so local testing needs an HTTPS tunnel.
  3. Create a **Key** with Sign In with Apple enabled. The Key ID becomes
     `APPLE_KEY_ID`; the downloaded `AuthKey_*.p8` becomes `APPLE_PRIVATE_KEY`
     (literal `\n` for newlines is fine). **The `.p8` downloads exactly once.**
  4. `APPLE_TEAM_ID` is on the membership page. `APPLE_BUNDLE_ID` defaults to
     `company.lnrt.evenup`.
  5. Set **`NEXT_PUBLIC_APPLE_ENABLED=true`** (build time) to render the button.

  EvenUp derives Apple's `client_secret` (an ES256 JWT, max ~182 days) from the
  `.p8` at runtime and re-mints it automatically. You never paste a JWT.

  > **`APPLE_PRIVATE_KEY` is a runtime secret, never a build arg.** Only the
  > `NEXT_PUBLIC_*` flags are needed at build time. Docker build args are visible
  > in the image's layer history, so passing the `.p8` as one bakes a private key
  > into every copy of your image.

  > **Private-relay email.** Users who pick "Hide My Email" get an
  > `@privaterelay.appleid.com` address. Magic links and group invites sent to it
  > **bounce** unless you register your sending domain under Apple's
  > *Certificates, Identifiers & Profiles → More → Configure Email Sources*.
```

- [ ] **Step 5: Verify the compose file parses and the image builds**

```bash
docker compose config --quiet && echo "compose OK"
NEXT_PUBLIC_APPLE_ENABLED=true docker compose build web
```

Expected: `compose OK`, then a successful image build. If Docker is unavailable, at minimum run `docker compose config --quiet`.

- [ ] **Step 6: Commit**

```bash
git add .env.example infra/docker/Dockerfile docker-compose.yml docs/SELF_HOSTING.md
git commit -m "feat(infra): Apple env vars + plumb NEXT_PUBLIC_* build args

NEXT_PUBLIC_* is inlined by next build, but docker-compose passed no build args
and the Dockerfile declared no ARG, so a plain 'docker compose build' never got
a Google button. (Coolify injects build-time vars itself, so production was
unaffected.) Declare the ARGs so self-hosted builds match."
```

---

## Task 6: Native Apple sign-in on iOS

**Files:**
- Modify: `apps/mobile/package.json` (deps)
- Modify: `apps/mobile/app.config.ts:34-43` (plugins)
- Create: `apps/mobile/src/lib/apple-sign-in.ts`
- Modify: `apps/mobile/app/sign-in.tsx`

**Interfaces:**
- Consumes: the `apple` provider from Task 3 (server-side `appBundleIdentifier` validates the id_token audience).
- Produces: `signInWithApple(): Promise<{ ok: boolean; canceled: boolean }>` from `@/lib/apple-sign-in`.

`usesAppleSignIn: true` is already set (`app.config.ts:22`) but neither package is installed.

**The nonce, precisely.** Apple embeds whatever `nonce` you hand `signInAsync` into the id_token, and the convention is to hand it the SHA-256 **hash** of a raw nonce, then give the raw one to your backend. Better Auth's `nonceMatches` (`@better-auth/core/src/social-providers/apple.ts`) accepts `jwtNonce === nonce || jwtNonce === sha256Hex(nonce)`. So: **hashed to Apple, raw to Better Auth.** Passing the hashed value to both happens to work via the first branch, but defeats the point of the nonce.

- [ ] **Step 1: Install the Expo modules at SDK-correct versions**

```bash
pnpm --filter @evenup/mobile exec expo install expo-apple-authentication expo-crypto
```

Use `expo install` (not `pnpm add`): it resolves against Expo SDK 52's bundled
native-module list. Sanity check — you should get `expo-apple-authentication@~7.1.3`
and `expo-crypto@~14.0.2`. A `57.x` (the npm `latest` tag) means `pnpm add` was used
by mistake and the native build will break.

- [ ] **Step 2: Register the config plugin**

In `apps/mobile/app.config.ts`, add to the `plugins` array (after `'expo-secure-store'`):

```ts
    'expo-apple-authentication',
```

- [ ] **Step 3: Write the sign-in helper**

`apps/mobile/src/lib/apple-sign-in.ts`:

```ts
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { authClient, signIn } from './auth';

/**
 * Apple embeds the nonce we pass into the id_token. Convention (and Better
 * Auth's `nonceMatches`) is to hand Apple the SHA-256 hash and the backend the
 * raw value, so a stolen id_token cannot be replayed without the raw nonce.
 */
async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

/**
 * Apple returns the user's real name exactly once — on their first-ever consent
 * — and never again, and it is absent from the id_token entirely. If we don't
 * capture it here, this user is `EvenUp user` forever.
 */
async function backfillName(fullName: AppleAuthentication.AppleAuthenticationFullName | null) {
  const name = [fullName?.givenName, fullName?.familyName].filter(Boolean).join(' ').trim();
  if (!name) return;
  try {
    await authClient.updateUser({ name });
  } catch {
    // A missing display name is not worth failing an otherwise good sign-in.
  }
}

export async function signInWithApple(): Promise<{ ok: boolean; canceled: boolean }> {
  const { raw, hashed } = await makeNonce();
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashed,
    });

    if (!credential.identityToken) return { ok: false, canceled: false };

    const res = await signIn.social({
      provider: 'apple',
      idToken: { token: credential.identityToken, nonce: raw },
    });
    if (res.error) return { ok: false, canceled: false };

    // Must run *after* the session exists — updateUser is an authenticated call.
    await backfillName(credential.fullName);
    return { ok: true, canceled: false };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'ERR_REQUEST_CANCELED') return { ok: false, canceled: true };
    throw e;
  }
}
```

- [ ] **Step 4: Render the native button, iOS only**

In `apps/mobile/app/sign-in.tsx`, extend the imports:

```tsx
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple } from '@/lib/apple-sign-in';
```

Add state and a handler inside `SignInScreen`, after the existing `submit` function:

```tsx
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  async function onApple() {
    setAppleError(null);
    try {
      const { ok, canceled } = await signInWithApple();
      if (ok) router.replace('/');
      else if (!canceled) setAppleError(t('error.generic'));
    } catch {
      setAppleError(t('error.generic'));
    }
  }
```

Add `useEffect` to the React import on line 1:

```tsx
import { useEffect, useState } from 'react';
```

Then render the button inside the `<>...</>` branch, directly after the email `<Pressable>`:

```tsx
          {appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={theme.radius}
              style={styles.appleButton}
              onPress={onApple}
            />
          ) : null}
          {appleError ? <Text style={styles.error}>{appleError}</Text> : null}
```

And add the two styles to the `StyleSheet.create({...})` block:

```tsx
  appleButton: { height: 48, width: '100%' },
  error: { textAlign: 'center', color: '#b91c1c' },
```

`AppleAuthenticationButton` renders Apple's own HIG-compliant, iOS-localized label, so it needs no i18n key of its own. `isAvailableAsync()` returns `false` on Android and on iOS < 13, so the button self-hides.

- [ ] **Step 5: Verify**

```bash
pnpm --filter @evenup/mobile typecheck
pnpm --filter @evenup/mobile lint
```

Expected: no errors. (The mobile lint currently emits 2 pre-existing warnings; do not add more.)

A device build is out of scope for CI. If you have a Mac with Xcode and a provisioning profile:

```bash
cd apps/mobile && pnpm expo run:ios
```

`AppleAuthenticationButton` does **not** render in Expo Go — it needs a dev client build.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.config.ts \
        apps/mobile/src/lib/apple-sign-in.ts apps/mobile/app/sign-in.tsx pnpm-lock.yaml
git commit -m "feat(mobile): native Sign In with Apple on iOS

Hashed nonce to Apple, raw nonce to Better Auth. Backfills the display name
from credential.fullName, which Apple supplies only on first consent."
```

---

## Task 7: Full verification pass

**Files:** none modified.

**Interfaces:** consumes everything above.

- [ ] **Step 1: Run every automated gate**

The `api` suite needs a database. A dev Postgres is already running as the
`evenup-dev-db` container on port 55432:

```bash
export DATABASE_URL='postgresql://evenup:pass@localhost:55432/evenup'
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @evenup/web test:e2e
```

Expected: typecheck clean across 6 packages; lint clean apart from **2 pre-existing
`no-console` warnings in `apps/mobile`**; `core` 195 + `i18n` 19 + `api` 65 +
**`web` 20 (new)** = 299 unit tests; Playwright **28/28** (7 specs × 4 projects).

(`web` is 20, not the 16 originally planned: the review of Task 1 added four
fake-timer tests covering the refresh-on-read path, which the plan's original
test list left entirely unexercised.)

**Actual, run 2026-07-08 on this branch:** typecheck 6/6 ✓ · lint 6/6, exactly the
2 pre-existing mobile warnings ✓ · unit 299 ✓ (core 195, i18n 19, api 65, web 20)
· Playwright 28/28 ✓ (with `accountLinking` newly enabled — no regression to the
existing magic-link flows).

Without `DATABASE_URL`, the `api` suite reports `Environment variable not found:
DATABASE_URL` and skips 31 tests. That is a missing env var, not a regression.

If any gate fails, fix it before proceeding. Do not report success on a red gate.

- [ ] **Step 2: Confirm the button is genuinely gated**

```bash
grep -rn "NEXT_PUBLIC_APPLE_ENABLED" apps/web/src infra/docker/Dockerfile docker-compose.yml
```

Expected: three hits — the component, the Dockerfile `ARG`/`ENV`, and the compose build arg. Missing the Dockerfile hit means `docker compose build` produces a bundle where the button never renders.

> **Do not test this gate by grepping the bundle for `apple-signin`** (verified 2026-07-08). When `NEXT_PUBLIC_APPLE_ENABLED` is *unset*, Next does not inline it and cannot fold the branch — the chunk keeps a runtime lookup, `"true"===d.env.NEXT_PUBLIC_APPLE_ENABLED`, and the `apple-signin` string stays in the bundle even though the button never renders. Only when the var **is** defined at build does the ternary get folded away. So the string's presence proves nothing; check the rendered DOM instead.

Separately, when deploying to Coolify, add `NEXT_PUBLIC_APPLE_ENABLED=true` with **`is_buildtime: true`** — Coolify inlines it at build the same way it already does for `NEXT_PUBLIC_GOOGLE_ENABLED`.

> **`APPLE_PRIVATE_KEY` must be runtime-only in Coolify** (`is_buildtime: false`, `is_runtime: true`). It is a multiline PEM; passing it as a Docker build arg both mangles it and bakes a private key into an image layer. It is read by the server at boot, never by `next build`.

- [ ] **Step 3: Record what is NOT covered**

Automated tests cover the minter (12 tests, incl. the refresh-on-read path) and the display-name mapper (8 tests).

**Verified locally beyond the automated suite** (against a real production build + `next start`, with a self-signed ES256 key — recorded in `.superpowers/sdd/task-3-report.md`):

- The top-level `await` in `auth.ts` does not break route-handler init: `GET /api/auth/get-session` → 200.
- `POST /api/auth/sign-in/social {provider:'apple'}` → 200 with a real `appleid.apple.com/auth/authorize` URL carrying `client_id=<Services ID>` and `response_mode=form_post`. Since `createAuthorizationURL` throws `CLIENT_ID_AND_SECRET_REQUIRED` unless `options.clientSecret` is truthy, **this proves the getter fires per-request and returns a string**, not `[object Promise]`.
- Fail-soft: a malformed `APPLE_PRIVATE_KEY` → `get-session` 200, magic-link 200, Apple 404 `PROVIDER_NOT_FOUND`, log names `APPLE_PRIVATE_KEY`.
- The web button, via headless Chromium against a production build: flag set → Apple button renders, exactly one divider, and clicking it navigates to Apple. Flags unset → no buttons, no divider.

**Still NOT covered by anything automated**, and reachable only via the manual staging checklist below: the Apple **callback** leg (Apple → our `/api/auth/callback/apple`), the native iOS flow, real account linking against Apple, and private-relay email delivery. All four need Apple credentials; the last two also need a real device or a real mailbox. Nothing here pretends otherwise.

- [ ] **Step 4: Manual staging verification** (requires the Task-2 portal artifacts + deploy)

- [ ] Web: "Continue with Apple" appears, redirects to Apple, and returns signed in
- [ ] Web: an Apple sign-in with **"Share My Email"**, using an email that already has a magic-link account, **links into that account** (one user row, two `Account` rows)
- [ ] Web: an Apple sign-in with **"Hide My Email"** creates a separate account with a non-empty display name
- [ ] iOS device: the native sheet appears and sign-in succeeds
- [ ] iOS device: a **first-ever** Apple sign-in stores the user's real name (not `EvenUp user`) — this is the one shot at it
- [ ] iOS device: a **second** sign-in still lands in the same account
- [ ] Send a group invite to a `@privaterelay.appleid.com` address and confirm it is **delivered, not bounced** — otherwise register the Resend sending domain under Apple's *Email Sources*
- [ ] Cancel the native sheet mid-flow: no error is shown

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "chore: verification fixes for Apple sign-in"
```

---

## Deviations from the spec

1. **Task 5 also plumbs `NEXT_PUBLIC_*` build args through the Dockerfile and compose.** The spec (§9) said only "add the env vars". The Dockerfile declares no `ARG NEXT_PUBLIC_*` and compose passes no `build.args`, so `docker compose build` produces a bundle with the social buttons dead-code-eliminated. Two lines per flag, squarely in the blast radius of this change.

   *An earlier draft of this plan claimed Coolify production was broken too. That was checked and is false* — Coolify injects `is_buildtime` vars into Dockerfile builds itself, and the deployed bundle renders the Google button. The fix is for self-hosters, not for prod.
2. **`nonEmptyName` from spec §5(a) is named `appleDisplayName`** and lives in its own `apple-profile.ts` rather than inside `auth.ts`, so it can be unit-tested. Same behavior.
3. **`.env.example` gains `NEXT_PUBLIC_GOOGLE_ENABLED`** alongside the Apple flag, since Task 5 makes it functional for `docker compose` for the first time.
4. **Task 7 adds a Coolify-specific note** that `APPLE_PRIVATE_KEY` must be `is_buildtime: false`. The spec's §10 risk table anticipated newline mangling but not the image-layer exposure.
