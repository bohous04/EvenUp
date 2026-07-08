# Optional 2FA (TOTP + backup codes) — design spec

> **Status:** approved design, ready to plan
> **Date:** 2026-07-08
> **Scope owner:** `apps/web`, `apps/mobile`, `packages/db` (migration), `packages/i18n`
> **Related:** sub-project **#2** of the auth overhaul. **Depends on #1** (email + password — [`2026-07-08-email-password-auth-design.md`](./2026-07-08-email-password-auth-design.md)). Siblings: **#3** connected accounts. **#0** (SMTP) is *not* needed by 2FA itself.

## 1. Context & goal

Add **optional, per-user two-factor authentication** to EvenUp using **TOTP (authenticator app) + one-time backup codes**, via Better Auth 1.6.20's `two-factor` plugin, on **web and mobile**.

**No email dependency.** Unlike #1, 2FA is self-contained: enrollment shows a QR/secret and backup codes; recovery is the backup codes. The email-OTP second factor the plugin also offers is **out of scope** (it would need #0, and is redundant with TOTP).

## 2. Confirmed design decisions

1. **Factors: TOTP + backup codes only.** No email-OTP factor.
2. **Opt-in, never forced.** No admin-mandated 2FA.
3. **Web + mobile in this one spec** (enrollment + the login second-factor step on both).
4. **No "remember this device" / trust-device** (YAGNI) in v1.
5. **Offered only to users who have a password.** Better Auth requires the account password to enable/disable 2FA, so OAuth-only users (no `credential` account) can't enroll until they set a password. The UI shows a hint, not a broken button.
6. **DB migration required** (contrast #1): a `twoFactor` table + `User.twoFactorEnabled`.

## 3. 🔴 Security semantics — read before building

**2FA gates the password login path only.** Better Auth's `two-factor` plugin hooks the credential sign-in: after a correct password, it withholds the session (`twoFactorRedirect`) until a valid TOTP/backup code. **It does NOT gate OAuth sign-in.** A user with 2FA enabled *and* a linked Google/Apple account can still sign in via that provider **without** the second factor.

This is not a hole — Google/Apple enforce their own 2FA — but it defines what EvenUp's 2FA protects: **the password credential**, nothing else. The enrollment UI states this plainly ("Two-factor protects password sign-in; your Google/Apple logins are protected by those providers").

## 4. Dependencies & deploy gate

- **Depends on #1** (password): enabling 2FA requires a password, so 2FA is only meaningful/available after #1 ships. #2 is built on top of #1's branch/state.
- **Transitively inherits #1's deploy gate** (#0/SMTP), because #1 isn't in prod until then. 2FA itself needs no email.
- **Migration:** the `twoFactor` table + `User.twoFactorEnabled` column is a normal Prisma migration, runs on boot via the existing `entrypoint.sh` (same mechanism as the admin `3_admin_vip` migration).

## 5. Architecture

### 5.1 DB — `packages/db/prisma/schema.prisma` + migration

- `User.twoFactorEnabled Boolean @default(false)`.
- New `TwoFactor` model: `id`, `userId` (FK, cascade), `secret String` (encrypted), `backupCodes String` (encrypted), unique/index on `userId`. Field names/shape follow the plugin's `schema.mjs`.
- One new migration directory (e.g. `4_two_factor`).

Secret and backup codes are stored **encrypted** by the plugin (`symmetricEncrypt` with the app secret) — verified in the installed source. We do not add our own encryption.

### 5.2 Server — `apps/web/src/server/auth.ts`

- Add the `twoFactor()` plugin to `plugins: [...]` (order: before `nextCookies()`, which stays last).
- Default backup-code count / TOTP period left at plugin defaults unless a reason emerges.
- Everything else (email+password from #1, social providers, `databaseHooks`, `expo()`, `bearer()`) unchanged.

### 5.3 Clients

- **Web** `apps/web/src/lib/auth-client.ts`: add `twoFactorClient()` → exposes `authClient.twoFactor.enable/disable/getTotpUri/verifyTotp/verifyBackupCode/generateBackupCodes`.
- **Mobile** `apps/mobile/src/lib/auth.ts`: add `twoFactorClient()` alongside the existing Expo client plugins.

`enable` returns `{ totpURI, backupCodes }` — the `otpauth://` URI to render as a QR, and the plaintext backup codes to show **once**.

### 5.4 Enrollment UI (web + mobile) — in Settings / "Security"

Flow:
1. "Enable two-factor" → confirm **password**.
2. `twoFactor.enable({ password })` → render QR from `totpURI` (web: QR image; mobile: QR + the secret as copyable text, since scanning on the same device is awkward) + display the **backup codes** with a "download / copy — you won't see these again" affordance.
3. Verify a 6-digit code → `twoFactor.verifyTotp({ code })` → enabled; `User.twoFactorEnabled` flips true.

Also: **Disable** (`twoFactor.disable({ password })`), and **Regenerate backup codes** (`twoFactor.generateBackupCodes({ password })`, shown once). Status ("Two-factor: on/off") shown in Security settings. Gate the whole section behind "user has a password"; otherwise show "Set a password to enable two-factor."

### 5.5 Login second-factor step (web + mobile)

After `signIn.email`, if the response indicates `twoFactorRedirect` (2FA pending), route to a **"Enter your 6-digit code"** screen:
- `twoFactor.verifyTotp({ code })` → session completes → home.
- "Use a backup code instead" → `twoFactor.verifyBackupCode({ code })`.
- The existing `databaseHooks.session.create.before` (admin seed / disabled block) still runs when the session finally completes.

This step is required on **both** platforms — otherwise a 2FA user could never finish signing in on mobile.

### 5.6 Admin recovery — `/admin`

Add a **"Reset two-factor"** action to the existing admin user row (next to VIP/admin/disable/delete) that clears a user's `twoFactorEnabled` + `TwoFactor` row. This is the last-resort recovery for a user who lost both their authenticator and their backup codes and has no OAuth login. Gated by the existing `adminProcedure`.

### 5.7 i18n — `packages/i18n/src/locales/{cs,en}.ts`

New keys (both locales, parity-enforced): enable/disable 2FA, scan-QR / enter-secret, backup-codes ("save these, shown once"), verify-code, "enter your code" at login, "use a backup code", invalid-code error, "set a password first", admin "reset 2FA".

## 6. Error handling

Surface plugin error codes as friendly localized strings: invalid TOTP code, invalid/used backup code, wrong password (enable/disable), 2FA-already-enabled. On the login step, a wrong code doesn't drop the pending state — the user can retry or switch to a backup code.

## 7. Testing

**2FA is genuinely E2E-testable** (no email needed): a Playwright test can generate a valid TOTP from the `otpauth` secret with a TOTP library, so the full **enroll → verify → sign-out → sign-in → second-factor** loop is automatable. This is stronger coverage than #1's email-gated flows.

- **E2E (web):** enroll a fresh password user, verify with a generated code, sign out, sign in, complete the second factor; plus a backup-code path.
- **Unit (web, vitest):** any pure helper (e.g. parsing the `otpauth` secret, mapping error codes → i18n keys).
- **Mobile:** typecheck + lint; the enroll/login loop verified on a device/staging.
- **Migration:** applied against the dev DB; assert the columns/table exist and existing users default to `twoFactorEnabled=false`.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Users think 2FA protects everything | Enrollment copy states it gates the **password** path; OAuth is provider-protected (§3) |
| Lost authenticator **and** lost backup codes → lockout | Backup codes shown/downloadable at enrollment; **admin "reset 2FA"** (§5.6) as last resort; OAuth login (if linked) also bypasses |
| OAuth-only user clicks "enable 2FA" and it fails on missing password | Section gated behind "has a password", with a hint |
| Migration failure on boot | Same entrypoint-migration path already proven by `3_admin_vip`; test against dev DB first |

## 9. Out of scope

- Email-OTP second factor (needs #0; redundant with TOTP).
- "Remember this device" / trust-device.
- Forced/mandatory 2FA (org policy).
- WebAuthn / passkeys.

## 10. Definition of done

- [ ] `pnpm typecheck` + `pnpm lint` green
- [ ] Prisma migration adds `TwoFactor` + `User.twoFactorEnabled`; existing users default false
- [ ] `twoFactor()` server plugin + `twoFactorClient()` on web and mobile clients
- [ ] Web: enroll (QR + backup codes + verify), disable, regenerate codes, login second-factor step
- [ ] Mobile: enroll (QR + copyable secret + backup codes), disable, login second-factor step
- [ ] Admin "reset 2FA" action
- [ ] Enrollment copy states the password-path-only semantics
- [ ] CZ + EN strings; i18n parity green
- [ ] E2E: full enroll → verify → re-login → second-factor loop (TOTP generated in-test), plus a backup-code path
- [ ] **Not in this cycle:** production deploy (transitively blocked on #0/#1), connected accounts (#3)
