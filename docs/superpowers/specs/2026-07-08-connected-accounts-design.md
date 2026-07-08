# Connected accounts — link / unlink OAuth logins — design spec

> **Status:** approved design, ready to plan
> **Date:** 2026-07-08
> **Scope owner:** `apps/web`, `apps/mobile`, `packages/i18n`
> **Related:** sub-project **#3** of the auth overhaul. **Builds on #1** (email + password — [`2026-07-08-email-password-auth-design.md`](./2026-07-08-email-password-auth-design.md)) and sits beside **#2** (2FA — [`2026-07-08-two-factor-totp-design.md`](./2026-07-08-two-factor-totp-design.md)).

## 1. Context & goal

Let a **logged-in** user attach or detach additional login providers (Google, Apple — **including Apple "Hide My Email"**) to their single EvenUp account, and see which methods are connected. This is the original request that opened the auth overhaul; it landed last because it displays cleanest once #1 (password) exists.

Uses Better Auth 1.6.20's **core** account-management methods (no client plugin, like `signIn.social`): `authClient.listAccounts()`, `authClient.linkSocial()`, `authClient.unlinkAccount()`. Routes verified present: `/list-accounts`, `/link-social`, `/unlink-account`.

## 2. Why this needs #1 first (the model)

After #1, email+password is stored as a **`credential`** account row. So `listAccounts()` returns, per user, some subset of `credential`, `google`, `apple`:

- **Password user:** `[credential, google?, apple?]` → unlinking any OAuth is safe; the `credential` remains.
- **OAuth-only user** (signed up via Google, no password): `[google]` → unlinking the last one is **correctly blocked** by Better Auth (`FAILED_TO_UNLINK_LAST_ACCOUNT`) — they'd have no login left.

This is why **`allowUnlinkingAll` is NOT set**: Better Auth's default last-account guard is now exactly right. (Before #1, the fallback was magic-link over broken email, so the guard's meaning was murky. #1 fixes that.)

## 3. Confirmed design decisions

1. **Server:** add **`allowDifferentEmails: true`** to `account.accountLinking`. Required so Apple "Hide My Email" (relay address ≠ the user's email) can be linked. **Verified safe:** `allowDifferentEmails` is read only in the three **manual, authenticated** link branches (`callback.mjs`, `account.mjs`, `generic-oauth/routes.mjs`) — it is **not** read by the auto-sign-in link path (`handleOAuthUserInfo`), so the account-takeover guard (`email_verified` + `requireLocalEmailVerified`) is untouched. Keep `enabled: true`, **no** `trustedProviders`, **no** `allowUnlinkingAll`.
2. **Web + mobile** (consistent with #1/#2).
3. **The `credential` (email/password) method is displayed but managed by #1's card;** #3's card owns only the OAuth rows and the connect buttons.
4. **Provider connect buttons gate on the same instance flags as sign-in** (`NEXT_PUBLIC_GOOGLE_ENABLED`, `NEXT_PUBLIC_APPLE_ENABLED`) and are hidden for an already-connected provider.

## 4. Architecture

### 4.1 Server — `apps/web/src/server/auth.ts`

One line: `account: { accountLinking: { enabled: true, allowDifferentEmails: true } }`. Nothing else changes.

### 4.2 Web — `apps/web/src/components/connected-accounts.tsx` _(new Card)_

Rendered by the settings page (`<ConnectedAccounts />`) so `settings/page.tsx` doesn't grow and the card is a testable unit.

- Query `authClient.listAccounts()` (via a React Query `useQuery`, matching the page's existing TanStack usage).
- Map `providerId`: **`credential` → skip** (owned by #1's password card); **`google` / `apple`** → a row with the provider name/icon, "connected {createdAt}", and a **Disconnect** button.
- **Connect Google / Connect Apple** buttons for providers that are (a) enabled on the instance and (b) not already connected → `linkSocial({ provider, callbackURL: '/settings' })` (OAuth redirect back to settings).
- **Disconnect** → `unlinkAccount({ providerId, accountId })` → refetch.
- Icons: `AppleLogo` from `icons.tsx`; a Google mark.

### 4.3 Pure decision helper — `apps/web/src/components/connectable-providers.ts` _(new)_

`connectableProviders(accounts, { google, apple })` → the list of providers to offer as connectable (enabled on instance ∧ not already in `accounts`). Pure, **unit-tested in vitest** — this is the one automatically-verifiable piece (the real OAuth link/unlink needs a provider, so it's manual staging, consistent with the Apple work).

### 4.4 Mobile — `apps/mobile`

A "Connected accounts" screen mirroring the web card:

- **List / unlink** are provider-agnostic API calls — identical to web.
- **Link Apple:** native — `linkSocial({ provider: 'apple', idToken: { token, nonce } })` reusing the existing native-credential + nonce flow from the Apple sign-in work. `allowDifferentEmails: true` is what lets "Hide My Email" attach.
- **Link Google:** EvenUp mobile has no native Google today, so Google linking uses the OAuth **redirect** opened via `expo-web-browser` (or is deferred if Google-on-mobile isn't wired). Called out in the plan; not a blocker for Apple linking.

### 4.5 Error handling

Surface Better Auth codes as friendly localized strings:

- `FAILED_TO_UNLINK_LAST_ACCOUNT` → "This is your only login method. Set a password first," linking to #1's password card.
- `account_already_linked_to_different_user` → "That account is already connected to another EvenUp account."
- Link email-mismatch cannot occur here (we set `allowDifferentEmails: true`).

### 4.6 i18n — `packages/i18n/src/locales/{cs,en}.ts`

Keys (both locales, parity-enforced): card title, "connect {provider}", "disconnect", "connected {date}", the two error strings, "set a password first". Reuse the existing `auth.continueGoogle` / `auth.continueApple` where natural.

## 5. Settings page composition

The settings "Login & security" area stacks three independently-owned cards: **password** (#1), **two-factor** (#2), **connected accounts** (#3). #3 adds only its own card; it does not render password or 2FA state.

## 6. Testing

- **Unit (vitest):** `connectableProviders` across the matrix (neither/one/both enabled × already-connected or not).
- **Manual staging:** the real link (Google redirect; Apple "Hide My Email" native), unlink, and the last-account block — they need real providers, same limitation as the Apple sign-in work.
- **Mobile:** typecheck + lint; link/unlink verified on device/staging.

## 7. Risks

| Risk                                                        | Mitigation                                                                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple "Hide My Email" fails to link (`email_doesn't_match`) | `allowDifferentEmails: true` (§3), verified to touch only the manual authenticated path                                                      |
| A user disconnects their only login                         | Better Auth's default last-account guard blocks it; UI explains + points to "set a password" (#1)                                            |
| Linking an account already owned by another user            | Surfaced as a friendly error; Better Auth rejects the bind                                                                                   |
| Mobile Google linking complexity                            | Apple native link ships; Google-on-mobile via web-browser redirect or deferred, called out — doesn't block the headline "Hide My Email" case |

## 8. Out of scope

- Merging two pre-existing separate accounts (account-merge — its own project).
- Password management (#1) and 2FA management (#2) — their own cards.

## 9. Definition of done

- [ ] `pnpm typecheck` + `pnpm lint` green
- [ ] `allowDifferentEmails: true` on the server
- [ ] Web: connected-accounts card — list, connect (gated), disconnect, friendly errors
- [ ] Mobile: connected-accounts screen — list, unlink, Apple native link; Google link via web-browser (or explicitly deferred)
- [ ] `connectableProviders` pure helper with vitest coverage of the matrix
- [ ] CZ + EN strings; i18n parity green
- [ ] Manual staging: connect Apple "Hide My Email" attaches to the existing account; disconnect works; last-account is blocked with the set-a-password hint
