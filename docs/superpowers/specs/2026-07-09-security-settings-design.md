# Security settings — design

**Date:** 2026-07-09
**Status:** Approved (design)

## Goal

Add a **Security** section to the Settings page giving a signed-in user three
capabilities:

1. **Change / set their password.**
2. **Two-factor authentication (2FA)** via an authenticator app (TOTP) + backup codes.
3. **Link multiple login methods** (email/password, Google, Apple) to one
   account, so they can sign in with any of them and land on the same account.

Built on the existing **Better Auth 1.2.x** setup.

## Non-goals

- SMS/phone 2FA (no SMS provider). Email-OTP 2FA is out of scope.
- Passkeys / WebAuthn.
- A settings **tab bar** — Security is a `Card` section like the others (Profile,
  OpenRouter key, Data). Can be revisited later.
- Localizing Better Auth's own internal flows beyond the error strings surfaced
  in this UI.

## Current state (what already exists)

- `auth.ts`: email+password (with `sendResetPassword` email), Google + Apple
  social providers, and **`account: { accountLinking: { enabled: true } }`**.
- `/reset-password` and `/forgot-password` pages already exist.
- `qrcode` dependency is already installed (used for QR payments).
- Migrations auto-apply on deploy: `infra/docker/entrypoint.sh` runs
  `prisma migrate deploy` before starting the server.
- **No 2FA plugin yet.**

## Architecture / components

### 1. Backend setup (one-time)

- **`apps/web/src/server/auth.ts`**
  - Add `appName: 'EvenUp'`.
  - Add `twoFactor({ issuer: 'EvenUp' })` to `plugins` (before `nextCookies()`,
    which must stay last). Use default `skipVerificationOnEnable: false` so 2FA
    only activates after the user verifies a code.
- **`apps/web/src/lib/auth-client.ts`**
  - Add `twoFactorClient()` to the client plugins. Export the `twoFactor`
    namespace for the UI.
- **Prisma migration** (`packages/db/prisma/schema.prisma` + generated SQL)
  - `User.twoFactorEnabled Boolean @default(false)`.
  - New `TwoFactor` model: `id`, `userId` (FK, cascade), `secret String?`,
    `backupCodes String?`. Table name `twoFactor` (Better Auth default).
  - Generate with `prisma migrate dev`; commit the SQL. Applied on next deploy.

### 2. Security `Card` (`apps/web/src/app/settings/page.tsx` + subcomponents)

Split into focused client components under `apps/web/src/components/security/`
so `settings/page.tsx` stays readable:

- `SecurityCard` — wrapper; queries `authClient.listAccounts()` once and passes
  down `hasPassword` / linked providers / `twoFactorEnabled` (from `user.me`).
- `PasswordSection`
  - `hasPassword` → **Change password**: current + new (min 8) →
    `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })`.
  - `!hasPassword` (OAuth-only) → **Set a password**: button → send set-password
    email (reuse `requestPasswordReset` / reset flow). Explains why.
- `LinkedAccountsSection`
  - Rows for Password, Google, Apple (only providers configured on this
    instance — respect `NEXT_PUBLIC_GOOGLE_ENABLED` / `NEXT_PUBLIC_APPLE_ENABLED`).
  - Linked → status + **Unlink** (`unlinkAccount({ providerId })`), disabled when
    it's the last remaining login method.
  - Not linked → **Link** (`linkSocial({ provider, callbackURL: '/settings' })`).
- `TwoFactorSection`
  - Disabled → **Enable**: password prompt → `twoFactor.enable({ password })`
    returns `totpURI` + `backupCodes` → render QR (via `qrcode`) + manual secret
    → 6-digit code input → `twoFactor.verifyTotp({ code })` confirms → reveal the
    10 backup codes once (copy + download `.txt`).
  - Enabled → **Disable**: password prompt → `twoFactor.disable({ password })`.
  - Gated behind `hasPassword` (2FA requires a password).

### 3. Sign-in flow change (`apps/web/src/components/sign-in.tsx`)

Handle 2FA **in place** (no new route):

- `signIn.email(..., { onSuccess })`: if `ctx.data?.twoFactorRedirect === true`,
  switch the card to a **code step** instead of navigating home.
- Code step: 6-digit input → `twoFactor.verifyTotp({ code, trustDevice })`
  (with a "trust this device" checkbox). On success → navigate home.
- "Use a backup code" toggle → `twoFactor.verifyBackupCode({ code })`.
- Keep a "back to password" affordance.

## Data flow (2FA enable)

```
user clicks Enable
  → prompt password
  → twoFactor.enable({ password })  ── server: create secret+backupCodes (2FA not yet active)
  → show QR(totpURI) + manual secret
  → user scans, enters 6-digit code
  → twoFactor.verifyTotp({ code })  ── server: activate, set user.twoFactorEnabled=true
  → reveal backupCodes (one-time)
```

## i18n & error handling

- New `security.*` keys in `cs` + `en` (labels, hints, buttons, statuses,
  success/warning copy).
- **Better Auth errors are NOT routed through our tRPC `errorFormatter`.** Map
  the relevant Better Auth error codes to localized strings client-side in the
  Security UI and the sign-in code step (e.g. invalid password, invalid/expired
  TOTP, backup code used/invalid, provider already linked, last-account unlink).
  Fall back to a generic localized message.

## Edge cases / safety

- **OAuth-only user (no password):** password + 2FA sections show a "set a
  password first" state instead of the normal forms.
- **Never allow unlinking the last login method** (UI guard + rely on Better
  Auth's own guard as backstop).
- **Backup codes are shown once**; copy/download prompt, with a warning.
- **`revokeOtherSessions: true`** on password change.
- **Rate limiting** already enabled in production for auth endpoints.

## Testing

- Integration (`packages/api` / better-auth server via a test caller where
  feasible): enable → verifyTotp (generate the code from the secret with a TOTP
  lib) → disable; account listing reflects linked providers; unlink guard.
- Unit: the localized-error mapping helper.
- The interactive sign-in 2FA step and OAuth redirect are covered manually /
  where E2E can drive them; note any gaps.

## Deploy

- Migration + plugin ship in the same change. `entrypoint.sh` runs
  `prisma migrate deploy` before the server boots, so the `twoFactor` table
  exists before the plugin queries it. No manual ops step.

## Open questions

- None blocking. "Trust this device" duration uses the Better Auth default.
