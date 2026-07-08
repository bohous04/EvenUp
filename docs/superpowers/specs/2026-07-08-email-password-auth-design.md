# Email + password auth (hard switch from magic link) — design spec

> **Status:** approved design, ready to plan
> **Date:** 2026-07-08
> **Scope owner:** `apps/web` (Better Auth server + auth UI), `apps/mobile` (Expo auth screens), `packages/i18n`
> **Related:** [`docs/PRD.md`](../../PRD.md) FR-1.2 · this is sub-project **#1** of an auth overhaul; siblings: **#2** 2FA (TOTP), **#3** connected accounts. Prerequisite **#0** = production email delivery (SMTP), deferred by the user.

## 1. Context & goal

EvenUp currently logs users in with an **email magic link** (Better Auth `magicLink` plugin), plus optional Google/Apple OAuth. The user wants to switch the primary email method to **email + password**, demote the emailed link to **password reset only**, and (in sibling specs) add optional 2FA and a connected-accounts UI.

This spec covers **#1: email + password**, on **both web and mobile**, as a **hard switch** — the magic-link _login_ is removed, not kept alongside.

"Magic link only for reset" resolves to a mechanism swap: Better Auth's password reset is its **own** `forget-password` → email → `reset-password` flow, _not_ the `magicLink` plugin. So we **remove the `magicLink` plugin** and the reset email is the native forget-password link. Same UX (click an emailed link), different mechanism.

## 2. Confirmed design decisions

1. **Hard switch to password-only.** Remove the `magicLink` plugin. No transitional magic-link/password coexistence.
2. **Web + mobile in this one spec.**
3. **`requireEmailVerification: true`** in prod (gated off in dev/E2E, see §Testing).
4. **Open self-serve signup** (anyone with an email), matching today's magic-link behavior.
5. **Password min length 8** (Better Auth default).
6. **Collect a display name at signup** so new users aren't stored as `""`/`EvenUp user`.
7. **Reset + verification happen on the web** — the emailed link points at the web app; mobile does not implement a reset-token screen (sidesteps deep-link reset).
8. **No DB migration** — `Account.password String?` already exists in the schema.

## 3. 🔴 Deploy gate — do NOT ship to prod before #0

**Prerequisite #0 (production SMTP) is deferred but is a hard gate for deploying #1.** Without delivered email:

- New users can't complete `requireEmailVerification` → can't log in.
- Existing **magic-link-only** users have no password; the reset email that would let them set one never arrives → **locked out**.
- The mobile app currently has _only_ magic-link login; removing it server-side leaves old mobile users with no working path until they set a password (which needs email).

Google/Apple OAuth users are unaffected — they never used a password.

**Consequence, stated plainly:** the code in #1 is built and verified in **dev/E2E** (where `AUTH_DEV_ECHO=true` disables the verification requirement), but **must not be enabled in production** until #0 is done and existing magic-link users have a migration window. The plan's Definition of Done reflects this: "prod deploy" is explicitly out of #1's scope.

## 4. Architecture

### 4.1 Server — `apps/web/src/server/auth.ts`

- Replace `emailAndPassword: { enabled: false }` with:
  ```ts
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: !env.authDevEcho, // mirror the existing rateLimit gate
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(resetPasswordEmail(user.email, url));
    },
  },
  emailVerification: {
    sendOnSignUp: true,                 // auto-send the verification email at signup
    autoSignInAfterVerification: true,  // land signed in after clicking the link
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(verifyEmail(user.email, url));
    },
  },
  ```
- **Remove the `magicLink(...)` plugin** from `plugins: [...]`. Keep `expo()`, `bearer()`, `nextCookies()` (last).
- Remove the now-unused imports `rememberMagicLink` (`./magic-link-store.js`) and `magicLinkEmail` (`./email.js`); add `resetPasswordEmail`, `verifyEmail`.
- Update the file's top comment and the `expo()` comment — they reference magic-link verify; the deep-link handoff now matters only for native OAuth (Apple/Google) callbacks.
- **Untouched:** `socialProviders`/`buildSocialProviders`, `account.accountLinking`, `databaseHooks` (admin seeding + disabled-account block), `rateLimit`, `trustedOrigins`, the Apple secret bootstrap.

Config option names verified against installed `@better-auth/core@1.6.20` types: `requireEmailVerification`, `minPasswordLength`, `sendResetPassword`, `autoSignIn`, and `emailVerification.sendVerificationEmail`.

### 4.2 Email templates — `apps/web/src/server/email.ts`

- Add `resetPasswordEmail(to, url)` and `verifyEmail(to, url)` (mirror the existing `magicLinkEmail` shape: subject + text/html, same `sendEmail` transport).
- Remove `magicLinkEmail` and delete `apps/web/src/server/magic-link-store.ts` (the dev-echo store) — E2E no longer reads an echoed link.
- `env.authDevEcho` stays (it gates `rateLimit` and now `requireEmailVerification`); only its magic-link usage goes.

### 4.3 Web UI — `apps/web/src/components/`

Better Auth exposes email+password as **core** client methods (no client plugin, like `signIn.social`): `signIn.email`, `signUp.email`, `forgetPassword`, `resetPassword`. Remove `magicLinkClient()` from `apps/web/src/lib/auth-client.ts`.

- **`sign-in.tsx`** — replace the magic-link form with email + password (`signIn.email({ email, password, callbackURL: '/' })`). Keep the Google/Apple social buttons and divider unchanged. Add a **"Forgot password?"** link and a **"Sign up"** toggle/link.
- **`sign-up.tsx`** _(new)_ — name + email + password → `signUp.email({ name, email, password })` → "check your email to verify" screen. Handle "email already in use".
- **`forgot-password.tsx`** _(new, or a mode of sign-in)_ — email → `forgetPassword({ email, redirectTo: '/reset-password' })` → "if that address exists, we sent a link".
- **`/reset-password` page** _(new, `apps/web/src/app/reset-password/page.tsx`)_ — reads `token` from the query, new-password form → `resetPassword({ newPassword, token })` → success → sign-in.
- **Verify-email landing** — Better Auth's GET `/verify-email?token=…&callbackURL=…` verifies and redirects to `callbackURL`; with `autoSignInAfterVerification` the user lands signed in. We provide the post-signup "verify your inbox" screen and a **resend** action (`sendVerificationEmail`).

### 4.4 Mobile UI — `apps/mobile/app/`

- **`sign-in.tsx`** — email + password (`signIn.email`). Keep the native Apple button (`signInWithApple`). Add "Forgot password?" and "Sign up".
- **`sign-up.tsx`** _(new)_ — name + email + password → `signUp.email` → "verify your email" screen.
- **Forgot password** — email → `forgetPassword({ email, redirectTo: <web>/reset-password })` → "we sent you an email." **The reset itself is completed in the browser** on the web `/reset-password` page; the app implements no reset-token screen and no reset deep link.
- Email verification link likewise opens the web verify route. The Expo `authClient` keeps its bearer-token/secure-store setup; only the sign-in method changes.

### 4.5 E2E — `apps/web/e2e/helpers.ts`

`helpers.signIn(page, email)` currently requests a magic link and visits the echoed URL. Rewrite it to **sign up (or sign in) with email + a fixed test password** — synchronous, no email needed. With `AUTH_DEV_ECHO=true` the verification requirement is off, so a freshly-signed-up test user can log in immediately. This removes the magic-link echo hack entirely and simplifies the harness.

### 4.6 i18n — `packages/i18n/src/locales/{cs,en}.ts`

New `auth.*` keys (both locales, parity enforced by `i18n.test.ts`): sign-up, password label, "forgot password", reset, "verify your email", resend, and error strings (wrong password, email already in use, unverified email, invalid/expired reset token). Remove magic-link-specific strings that become dead.

## 5. Data flow

- **Sign up:** `signUp.email({name,email,password})` → user row created (`emailVerified:false`) + `credential` account row with the password hash → verification email sent → user clicks link → `/verify-email` marks verified → (auto sign-in) home.
- **Sign in:** `signIn.email({email,password})` → if `requireEmailVerification` and unverified → error (offer resend) → else session + the existing `databaseHooks.session.create.before` runs (admin seeding / disabled-account block).
- **Forgot/reset:** `forgetPassword({email, redirectTo})` → email with `…/reset-password?token=…` → new-password form → `resetPassword({newPassword, token})` → sign in.

## 6. Existing-user migration

- **Magic-link-only users:** already `emailVerified:true` (magic-link set it), but have **no `credential` account row**. Path: "Forgot password?" → reset email → set password. Needs #0. **Until #0, they cannot get in via email** — only via Google/Apple if previously linked. This is the accepted cost of hard-switch + deferred SMTP and is why #1 is not deployed to prod in this cycle.
- **Google/Apple users:** unaffected.
- No data migration/backfill; no schema change.

## 7. Error handling

Surface Better Auth's error codes as friendly localized strings: invalid credentials, email-not-verified (with a resend action), email-already-in-use (at signup), invalid/expired reset or verification token. Never reveal whether an email exists on the forgot-password path (always show the same "if that address exists…" message).

## 8. Testing

- **E2E (web):** the rewritten `helpers.signIn` (password) exercises sign-up + sign-in across the existing 7 specs × 4 projects; verification is disabled via `AUTH_DEV_ECHO`. Add focused specs for the wrong-password and forgot-password entry points (the reset _completion_ needs a token — seed or intercept, or assert up to the "email sent" state).
- **Unit (web, vitest):** any pure helper extracted (e.g. mapping BA error codes → i18n keys) gets a test. The email templates get a render test (subject present, URL present, no unresolved placeholder).
- **Not automatable here:** real email delivery, the verification click, and the reset click end-to-end — they need #0. Documented, verified manually in staging once #0 lands.
- **Mobile:** typecheck + lint; the real flows need a device/staging (consistent with the Apple work).

## 9. Risks

| Risk                                                           | Mitigation                                                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Deploying before #0 locks out magic-link users + breaks mobile | Deploy gate (§3); #1's DoD excludes prod deploy                                                      |
| E2E breaks when magic-link login is removed                    | `helpers.signIn` rewritten to password in the same change; verification gated off by `AUTH_DEV_ECHO` |
| Removing `magicLink` breaks the Expo deep-link handoff         | `expo()` stays; it's needed for native **OAuth** callbacks, not just magic-link — comment corrected  |
| Open signup + no verification = spam/impersonation             | `requireEmailVerification: true` in prod                                                             |
| Reset/verify deep-link complexity on mobile                    | Reset + verify are web-hosted; mobile never handles the token                                        |

## 10. Out of scope

- **#0** production SMTP configuration (deferred by the user; hard prerequisite for deploy).
- **#2** 2FA (TOTP) — separate spec.
- **#3** connected-accounts UI and `allowDifferentEmails` — separate spec.
- Account merge for users who already have two separate accounts.

## 11. Definition of done

- [ ] `pnpm typecheck` + `pnpm lint` green across all packages
- [ ] `emailAndPassword` enabled; `magicLink` plugin and `magic-link-store.ts` removed; imports cleaned
- [ ] Web: sign-in (password), sign-up, forgot-password, `/reset-password`, verify-email screen
- [ ] Mobile: sign-in (password), sign-up, forgot-password ("email sent"); Apple button intact
- [ ] `helpers.signIn` rewritten to password; Playwright suite green (verification off via `AUTH_DEV_ECHO`)
- [ ] CZ + EN strings for all new auth copy; i18n parity test green
- [ ] Email templates for reset + verification, with render tests
- [ ] **Explicitly NOT done in this cycle:** production deploy (blocked on #0), 2FA (#2), connected accounts (#3)
