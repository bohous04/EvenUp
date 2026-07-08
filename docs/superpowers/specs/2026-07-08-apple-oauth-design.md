# Apple Sign In — web + iOS native (design spec)

> **Status:** approved design, ready to plan
> **Date:** 2026-07-08
> **Scope owner:** `apps/web` (Better Auth server + sign-in UI), `apps/mobile` (Expo native flow), `packages/i18n`
> **Related:** [`docs/PRD.md`](../../PRD.md) FR-1.2, §8.2, R4 · [`2026-07-07-web-finish-phase1-2-design.md`](./2026-07-07-web-finish-phase1-2-design.md) (deferred Apple to Phase 3)

## 1. Context & goal

PRD **FR-1.2** requires OAuth via Google and Apple, "Apple required for iOS App
Store". Google and email magic link ship today. Apple was explicitly deferred to
Phase 3 by the 2026-07-07 spec. This spec closes that gap.

Current state, verified 2026-07-08:

| Surface       | Auth methods today                                          |
| ------------- | ----------------------------------------------------------- |
| `apps/web`    | magic link + Google (gated on `NEXT_PUBLIC_GOOGLE_ENABLED`) |
| `apps/mobile` | magic link only — **no social buttons at all**              |

`apps/mobile/app.config.ts:22` already sets `usesAppleSignIn: true` citing
FR-1.2, but `expo-apple-authentication` is not installed. The capability is
declared and unimplemented.

### Version correction (important)

`apps/web/package.json` declares `better-auth: ^1.2.9`. pnpm resolves **1.6.20**.
In 1.6.x the social providers moved to `@better-auth/core`, and the Apple
provider's behavior differs from the 1.2.9 documentation. **Every claim in this
spec is read off the installed 1.6.20 source**, at
`@better-auth/core/src/social-providers/apple.ts`. Do not implement against the
1.2.9 docs.

### Confirmed design decisions

1. **Scope:** web + iOS native (both surfaces).
2. **Client secret:** derived at runtime from the `.p8` key, not a pasted static JWT.
3. **Account linking:** `accountLinking.enabled = true`, **no** `trustedProviders`.
4. **Test home:** `apps/web` gains vitest; the minter is unit-tested there.
5. **Native name:** `mapProfileToUser` fallback **plus** `updateUser` backfill from `credential.fullName`.

## 2. Prerequisites (manual, Apple Developer Portal)

Requires a paid Apple Developer Program membership ($99/yr).

| Artifact            | Value                                                                     | Used as                 |
| ------------------- | ------------------------------------------------------------------------- | ----------------------- |
| App ID              | `company.lnrt.evenup`, Sign In with Apple capability enabled              | native idToken audience |
| Services ID         | e.g. `company.lnrt.evenup.web`                                            | **web `clientId`**      |
| Domain + Return URL | `evenup.lnrtdev.cz` → `https://evenup.lnrtdev.cz/api/auth/callback/apple` | web redirect            |
| Key (`.p8`)         | Sign In with Apple enabled; yields Key ID                                 | JWT signing key         |
| Team ID             | from the membership page                                                  | JWT `iss`               |

Two things bite here:

- The `.p8` file downloads **exactly once**. Losing it means minting a new key.
- Web and native use **different client IDs** (Services ID vs. bundle ID). They
  are not interchangeable.

## 3. Client-secret minter — `apps/web/src/server/apple-secret.ts` _(new)_

Apple's `client_secret` is not a static string: it is an ES256 JWT signed with
the `.p8` key, and Apple caps its lifetime at **15777000 s (~182.6 days)**.

Add `jose` as an explicit dependency of `apps/web` (already resolved in the pnpm
store at 6.2.3 via Better Auth, but pnpm's strict `node_modules` means it must be
declared to be importable).

Claims:

| Claim        | Value                                             |
| ------------ | ------------------------------------------------- |
| header `alg` | `ES256`                                           |
| header `kid` | `APPLE_KEY_ID`                                    |
| `iss`        | `APPLE_TEAM_ID`                                   |
| `aud`        | `https://appleid.apple.com`                       |
| `sub`        | `APPLE_SERVICES_ID`                               |
| `exp`        | `iat + 150d` (headroom under Apple's ~182.6d cap) |

Behavior:

- Module-level cache `{ token, mintedAt }`.
- Sync accessor `appleClientSecret(): string` returns the cached token; if older
  than ~120 days it kicks off a fire-and-forget re-mint and returns the still-valid
  current token.
- Primed once at module load so the first request is never cold. Signing is async
  but the accessor must be sync (Better Auth reads `options.clientSecret` as a
  plain string), so `apple-secret.ts` primes the cache with a **top-level `await`**
  and `auth.ts` awaits that module's initialization before constructing the
  provider. ESM top-level await is supported in Next.js server modules. The
  accessor must never return a `Promise` — it would be stringified into the token
  request body as `[object Promise]`.
- `APPLE_PRIVATE_KEY` is `\n`-unescaped (`.replace(/\\n/g, '\n')`) before
  `importPKCS8`, since env transports flatten newlines.

### Why a _sync getter_ is load-bearing

`apple.ts` passes the whole `options` **object** into the token exchange and reads
`options.clientSecret` **per request**, not once at construction:

```ts
validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) =>
  validateAuthorizationCode({ code, codeVerifier, redirectURI, options, tokenEndpoint });
```

Therefore `get clientSecret() { return appleClientSecret(); }` is evaluated on
every token exchange, and the refresh actually takes effect. Without the getter,
the JWT would be frozen at module load and Apple sign-in would break 150 days
after the last deploy, with an opaque `invalid_client` from Apple and nothing in
our logs to explain it. This is the entire reason decision #2 was chosen over a
pasted static secret.

### Tests — `apps/web/src/server/apple-secret.test.ts` _(new)_

`apps/web` currently has Playwright only. Add `vitest` + a `vitest.config.ts`
(this also unblocks the other untested modules in `src/server/`: `env.ts`,
`email.ts`, `magic-link-store.ts`).

Generate an ES256 keypair in-test with `jose.generateKeyPair`, export PKCS8, then assert:

- decoded protected header `kid` matches the configured key id, `alg === 'ES256'`
- `iss === teamId`, `aud === 'https://appleid.apple.com'`, `sub === servicesId`
- `exp - iat <= 15777000` (Apple's cap)
- a second `appleClientSecret()` call returns the identical cached token
- a `\n`-escaped private key is accepted (the Coolify env shape)

## 4. Server config — `apps/web/src/server/env.ts` + `auth.ts`

```ts
// env.ts — mirrors the existing optional `google` block
apple: {
  servicesId: process.env.APPLE_SERVICES_ID,
  bundleId:   process.env.APPLE_BUNDLE_ID ?? 'company.lnrt.evenup',
  teamId:     process.env.APPLE_TEAM_ID,
  keyId:      process.env.APPLE_KEY_ID,
  privateKey: process.env.APPLE_PRIVATE_KEY,
}
```

Apple is enabled iff `servicesId && teamId && keyId && privateKey`, matching how
Google degrades gracefully for self-hosters.

```ts
// auth.ts
apple: {
  clientId: env.apple.servicesId,
  get clientSecret() { return appleClientSecret(); },
  appBundleIdentifier: env.apple.bundleId,
  mapProfileToUser: (p) => ({ name: nonEmptyName(p) }),
},

trustedOrigins: ['evenup://', 'https://appleid.apple.com'],
account: { accountLinking: { enabled: true } },
```

Three details, each verified against installed source:

- **`trustedOrigins` must gain `https://appleid.apple.com`.** Apple `form_post`s
  the callback cross-origin; without this the CSRF check rejects it.
- **`appBundleIdentifier` is native-only.** `apple.ts:149-155` resolves
  `audience = options.audience?.length ? options.audience : (options.appBundleIdentifier ?? options.clientId)`,
  and this is read only inside `verifyIdToken`. The web callback `decodeJwt`s the
  id_token without an audience check, so setting `appBundleIdentifier` cannot
  break the web flow.
- **No `trustedProviders`.** Apple and Google both return `email_verified` for
  real addresses, so plain `accountLinking.enabled` links them safely. Adding
  `trustedProviders` would force-link _unverified_ emails — Better Auth's own docs
  flag it as an account-takeover risk, and it would buy us nothing.

### Account-linking consequences

`accountLinking.enabled` currently defaults to `false` and `auth.ts` has no
`account` block. So today a magic-link user at `alice@gmail.com` who clicks
"Continue with Google" already hits `ACCOUNT_NOT_LINKED` and is stuck. Enabling
linking fixes that latent Google bug in the same stroke.

| Existing user                  | Apple choice                                      | Result                      |
| ------------------------------ | ------------------------------------------------- | --------------------------- |
| `alice@gmail.com` (magic link) | "Share My Email" → `alice@gmail.com`              | **linked** to existing user |
| `alice@gmail.com` (magic link) | "Hide My Email" → `x7k2@privaterelay.appleid.com` | **separate account**        |

The second row is unavoidable — Apple never reveals that the relay address maps
to `alice@gmail.com`. Document it; do not try to defeat it.

## 5. The empty-name bug

`apple.ts:191-199`, verbatim (their `TODO`, not ours):

```ts
// TODO: "" masking will be removed when the name field is made optional
let name: string;
if (token.user?.name) {
  name = `${firstName} ${lastName}`.trim();
} else {
  name = profile.name || '';
}
```

Apple's **id_token carries no `name` claim**. The name arrives only in the
form_post `user` parameter, and only on the user's _first_ consent ever.

| Path                 | `token.user`             | Resulting name              |
| -------------------- | ------------------------ | --------------------------- |
| Web, first consent   | populated from form_post | correct ✓                   |
| Web, later sign-ins  | absent                   | falls to `mapProfileToUser` |
| **Native `idToken`** | **always absent**        | **`""`**                    |

EvenUp renders member names throughout group lists, balances, and settle-up. An
empty name is loudly visible. Two layers:

**(a) Server — never store an empty name.**

```ts
const nonEmptyName = (p) => p.name?.trim() || p.email?.split('@')[0] || 'EvenUp user';
```

**(b) Mobile — backfill the real name on first consent.** `expo-apple-authentication`
returns `credential.fullName` exactly once. After `signIn.social` resolves (the
session must exist first), if `fullName.givenName` is present, call
`authClient.updateUser({ name })`. The `/update-user` route exists in 1.6.20.

This is the only path on iOS that ever learns the user's actual name.

## 6. Web UI — `apps/web/src/components/sign-in.tsx`

- Gate on `NEXT_PUBLIC_APPLE_ENABLED === 'true'`, mirroring `googleEnabled`
  (`sign-in.tsx:10`) so self-hosters without Apple credentials see no dead button.
- `signIn.social({ provider: 'apple', callbackURL: '/' })`, `data-testid="apple-signin"`.
- Apple HIG: black or white button, official wordmark, minimum height. Add an
  `Apple` SVG to `components/icons` — **an SVG icon component, never an emoji glyph.**
- i18n: new key `auth.continueApple` in both `packages/i18n/src/locales/en.ts` and
  `cs.ts`, alongside the existing `auth.continueGoogle`.

## 7. Mobile — `apps/mobile`

- Add `expo-apple-authentication` dep + config plugin (`usesAppleSignIn: true`
  already present at `app.config.ts:22`).
- iOS only (`Platform.OS === 'ios'`). Android renders nothing — per Apple's own
  guidance, and the mobile app has no other social login to trigger Guideline 4.8.
- Render `<AppleAuthentication.AppleAuthenticationButton>` for HIG compliance.
- Swallow `ERR_REQUEST_CANCELED` silently (user tapped away; not an error).

### The nonce, precisely

```
raw nonce  ──sha256──▶  AppleAuthentication.signInAsync({ nonce: hashed })
raw nonce  ───────────▶  signIn.social({ provider:'apple', idToken:{ token, nonce: RAW } })
```

Pass the **hashed** nonce to Apple and the **raw** nonce to Better Auth. Its
`nonceMatches` compares the JWT's nonce against the raw value first, then against
`sha256Hex(raw)` — so handing it the hashed value works by accident on one branch
and is wrong in principle. Pass raw.

## 8. Dev / CI reality

Apple rejects `localhost` and non-HTTPS return URLs. **The web Apple flow cannot
be exercised locally** without a public HTTPS tunnel, and the native flow needs a
real device/simulator plus a provisioning profile. Neither is reachable from CI.

Consequences, stated plainly rather than papered over:

- `NEXT_PUBLIC_APPLE_ENABLED` stays unset in dev and E2E → the button is hidden →
  the existing Playwright suite is unaffected.
- **CI covers exactly one thing: the minter's unit tests.** That is also the only
  genuinely new logic, and the only place a silent, delayed failure can hide.
- The redirect flow, the native flow, and account linking are verified **manually
  in staging**. There is no automated coverage for them, and this spec does not
  pretend otherwise.

## 9. Config & docs

Add `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`,
`APPLE_BUNDLE_ID`, `NEXT_PUBLIC_APPLE_ENABLED` to:

- `.env.example` (alongside `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, line ~19)
- `docker-compose.yml` (alongside the existing `GOOGLE_*` passthroughs, line ~56)
- `docs/SELF_HOSTING.md` (extend the optional-Google note at line ~40 with a full
  Apple walkthrough: the portal artifacts, the once-only `.p8` download, and the
  HTTPS-only return-URL constraint)
- Coolify production env for `evenup.lnrtdev.cz`

## 10. Risks

| Risk                                                   | Mitigation                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.p8` newlines mangled by Coolify's env handling       | `\n`-unescape, then validate `importPKCS8` **at startup** and fail fast with an explicit message — not at the first sign-in weeks later                                                                                                                                                          |
| Apple client secret silently expires                   | Runtime derivation + per-request getter (§3); the whole point of decision #2                                                                                                                                                                                                                     |
| **Private-relay email bounces**                        | EvenUp sends magic links and group invites via Resend. Mail to `@privaterelay.appleid.com` **bounces** unless the Resend sending domain is registered under Apple's _Email Sources_. Silently breaks invites for exactly the users who chose "Hide My Email". Register the domain as part of §2. |
| `better-auth` floats `^1.2.9` → 1.6.20                 | Out of scope to fix here, but the range is misleading. Worth pinning in a follow-up; this spec targets 1.6.20 explicitly                                                                                                                                                                         |
| Hidden-email users get `EvenUp user` as a display name | Accepted. §5(b) backfills the real name whenever Apple supplies it; users can rename in profile settings                                                                                                                                                                                         |

## 11. Definition of done

- [ ] `pnpm typecheck` and `pnpm lint` green across all packages
- [ ] `apple-secret.test.ts` passes (new vitest project in `apps/web`)
- [ ] Existing Playwright suite still green (Apple button hidden without the env flag)
- [ ] CZ + EN strings for `auth.continueApple`
- [ ] Manual staging verification, iOS device: native Apple sign-in creates a user with a real name
- [ ] Manual staging verification, web: Apple "Share My Email" links into an existing magic-link account
- [ ] Manual staging verification: an invite email to a `@privaterelay.appleid.com` address is delivered, not bounced
- [ ] `docs/SELF_HOSTING.md` documents the full portal setup
