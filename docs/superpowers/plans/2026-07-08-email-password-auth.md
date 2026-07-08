# Email + Password Auth (hard switch from magic link) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace magic-link email login with email + password across web and the Expo app; the emailed link becomes password-reset only.

**Architecture:** Enable Better Auth's core `emailAndPassword` (routes `/sign-in/email`, `/sign-up/email`, `/forget-password`, `/reset-password`, `/verify-email` — no client plugin needed, like `signIn.social`). Remove the `magicLink` plugin and its dev-echo plumbing. Reset + verification links are web-hosted; mobile never handles a token. Verification is required in prod, disabled in dev/E2E via the existing `AUTH_DEV_ECHO` gate.

**Tech Stack:** Better Auth 1.6.20 (core email+password), Next.js 15 + React 19, Expo SDK 52 / React Native, Playwright, vitest, pnpm + turbo.

**Spec:** [`docs/superpowers/specs/2026-07-08-email-password-auth-design.md`](../specs/2026-07-08-email-password-auth-design.md)

## Global Constraints

- **Better Auth is 1.6.20.** email+password is **core** — no client plugin. Config lives under `emailAndPassword` and `emailVerification`. Verified option names: `enabled`, `requireEmailVerification`, `minPasswordLength`, `sendResetPassword`; `emailVerification.sendOnSignUp`, `emailVerification.autoSignInAfterVerification`, `emailVerification.sendVerificationEmail`.
- **Hard switch:** remove the `magicLink` plugin and `signIn.magicLink`. No coexistence.
- **`requireEmailVerification: !env.authDevEcho`** — on in prod, off in dev/E2E (mirrors the existing `rateLimit: { enabled: !env.authDevEcho }`).
- **`minPasswordLength: 8`.**
- **Reset + email verification happen on the web.** Mobile implements no reset-token screen and no reset/verify deep link.
- **Every user-facing string needs both CZ and EN.** `packages/i18n/src/locales/cs.ts` is the `Messages` source of truth; `packages/i18n/src/i18n.test.ts:19` enforces exact key parity. Add to both locales in the same step.
- **Imports use explicit `.js` extensions** (repo convention, `moduleResolution: Bundler`).
- **Icons are SVG components, never emoji.**
- **Do NOT add a `Co-Authored-By: Claude` trailer**, or any Claude/Anthropic co-author line, to any commit. The user's global `CLAUDE.md` forbids it.
- **DO NOT deploy to production in this cycle.** Blocked on #0 (SMTP). Build + verify in dev/E2E only. The Definition of Done excludes prod deploy.

## Environment

- Dev Postgres: container `evenup-dev-db` on port 55432. Export before any api/E2E run: `export DATABASE_URL='postgresql://evenup:pass@localhost:55432/evenup'`. If missing, recreate: `docker run -d --name evenup-dev-db -e POSTGRES_USER=evenup -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=evenup -p 55432:5432 postgres:16-alpine` then `DATABASE_URL=… pnpm --filter @evenup/db exec prisma migrate deploy`.
- E2E `webServer` needs a production build: `export ENCRYPTION_KEY='0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0' BETTER_AUTH_SECRET='test-secret-for-build-verification-only-000' AUTH_DEV_ECHO=true` then `pnpm --filter @evenup/web build` before `pnpm --filter @evenup/web test:e2e`.
- Baseline before this plan: typecheck 6/6, lint (2 pre-existing `apps/mobile` `no-console` warnings), unit 323, Playwright 56/56.

## File Structure

| File                                             | Change     | Responsibility                                                             |
| ------------------------------------------------ | ---------- | -------------------------------------------------------------------------- |
| `apps/web/src/server/auth.ts`                    | modify     | enable `emailAndPassword` + `emailVerification`, remove `magicLink` plugin |
| `apps/web/src/server/email.ts`                   | modify     | add `resetPasswordEmail`, `verifyEmail`; remove `magicLinkEmail`           |
| `apps/web/src/server/magic-link-store.ts`        | **delete** | dev-echo store, no longer used                                             |
| `apps/web/src/app/api/dev/magic-link/route.ts`   | **delete** | dev-echo endpoint, no longer used                                          |
| `apps/web/src/lib/auth-client.ts`                | modify     | remove `magicLinkClient()`                                                 |
| `apps/web/src/components/sign-in.tsx`            | modify     | email+password form + links to sign-up / forgot                            |
| `apps/web/src/components/sign-up.tsx`            | **create** | name+email+password registration                                           |
| `apps/web/src/app/sign-up/page.tsx`              | **create** | route for sign-up                                                          |
| `apps/web/src/app/forgot-password/page.tsx`      | **create** | request-reset form                                                         |
| `apps/web/src/app/reset-password/page.tsx`       | **create** | set-new-password (token from URL)                                          |
| `apps/web/src/app/verify-email/pending/page.tsx` | **create** | "check your inbox" + resend                                                |
| `apps/web/e2e/helpers.ts`                        | modify     | `signIn` via password (API sign-up + UI login)                             |
| `apps/mobile/src/lib/auth.ts`                    | modify     | remove `magicLinkClient()`                                                 |
| `apps/mobile/app/sign-in.tsx`                    | modify     | email+password + links                                                     |
| `apps/mobile/app/sign-up.tsx`                    | **create** | registration                                                               |
| `apps/mobile/app/forgot-password.tsx`            | **create** | request-reset ("we sent an email")                                         |
| `apps/mobile/src/lib/magic-link-session.tsx`     | **delete** | magic-link deep-link capture, unused after switch                          |
| `apps/mobile/app/_layout.tsx` or caller          | modify     | drop the `<MagicLinkSession/>` mount if present                            |
| `packages/i18n/src/locales/{cs,en}.ts`           | modify     | new `auth.*` keys, remove dead magic-link strings                          |

---

## Task 1: Server switch + email templates + dev/E2E rewrite + web password sign-in

The load-bearing change. Removing the `magicLink` plugin, the web sign-in UI, the dev-echo endpoint, and the E2E helper are **coupled** — they must change together or the E2E suite can't drive sign-in. Deliverable: dev/E2E sign in with email + password; Playwright green.

**Files:**

- Modify: `apps/web/src/server/auth.ts`
- Modify: `apps/web/src/server/email.ts`
- Delete: `apps/web/src/server/magic-link-store.ts`, `apps/web/src/app/api/dev/magic-link/route.ts`
- Modify: `apps/web/src/lib/auth-client.ts`
- Modify: `apps/web/src/components/sign-in.tsx`
- Modify: `apps/web/e2e/helpers.ts`
- Modify: `packages/i18n/src/locales/{cs,en}.ts`

**Interfaces produced (later tasks rely on these):**

- Web client: `signIn.email({ email, password, callbackURL })`, `signUp.email({ name, email, password })`, `authClient.requestPasswordReset({ email, redirectTo })`, `authClient.resetPassword({ newPassword, token })`, `authClient.sendVerificationEmail({ email, callbackURL })` — all core, exported from `@/lib/auth-client`.
- i18n keys added: `auth.signInTitle`, `auth.email`, `auth.password`, `auth.signInBtn`, `auth.signUpLink`, `auth.forgotLink`, `auth.err.invalidCredentials`, `auth.err.unverified`.
- Sign-in page testids: keep the human-facing form; the "check inbox" magic state (`data-testid="magic-sent"`) is removed.

- [ ] **Step 1: Email templates — replace `magicLinkEmail` with `resetPasswordEmail` + `verifyEmail`**

In `apps/web/src/server/email.ts`, delete `magicLinkEmail` and add (reuse the same branded HTML wrapper, only the copy + subject differ):

```ts
/** Branded bilingual (CZ/EN) password-reset email. */
export function resetPasswordEmail(to: string, url: string): EmailMessage {
  const text = `Obnovení hesla EvenUp / Reset your EvenUp password\n\n${url}\n\nPokud jste o obnovení nežádali, tento e-mail ignorujte.\nIf you didn't request this, ignore this email.`;
  const html = brandedButton(
    url,
    'Obnovte heslo klepnutím na tlačítko · Reset your password',
    'Obnovit heslo / Reset password',
  );
  return { to, subject: 'Obnovení hesla EvenUp / Reset your EvenUp password', html, text };
}

/** Branded bilingual (CZ/EN) email-verification email. */
export function verifyEmail(to: string, url: string): EmailMessage {
  const text = `Ověření e-mailu EvenUp / Verify your EvenUp email\n\n${url}\n\nPokud jste si účet nezakládali, tento e-mail ignorujte.\nIf you didn't create an account, ignore this email.`;
  const html = brandedButton(
    url,
    'Ověřte e-mail klepnutím na tlačítko · Verify your email',
    'Ověřit e-mail / Verify email',
  );
  return { to, subject: 'Ověření e-mailu EvenUp / Verify your EvenUp email', html, text };
}
```

Extract the shared HTML into a private `brandedButton(url, intro, cta)` helper by lifting the existing `magicLinkEmail` markup (same `<div>` shell, `${url}` button + fallback link). Update the file's top doc comment: "transactional messages (password reset + email verification)". Update the `console.log` fallback comment to drop the AUTH_DEV_ECHO/magic-link mention.

- [ ] **Step 2: Delete the magic-link dev plumbing**

```bash
git rm apps/web/src/server/magic-link-store.ts apps/web/src/app/api/dev/magic-link/route.ts
```

- [ ] **Step 3: Server config — `apps/web/src/server/auth.ts`**

- Change the import on line 12 from `import { sendEmail, magicLinkEmail } from './email.js';` to `import { sendEmail, resetPasswordEmail, verifyEmail } from './email.js';`.
- Remove line 6's `magicLink` from `import { magicLink, bearer } from 'better-auth/plugins';` → `import { bearer } from 'better-auth/plugins';`.
- Remove line 11 `import { rememberMagicLink } from './magic-link-store.js';`.
- Replace `emailAndPassword: { enabled: false },` with:

```ts
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: !env.authDevEcho,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(resetPasswordEmail(user.email, url));
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(verifyEmail(user.email, url));
    },
  },
```

- In `plugins: [...]`, remove the entire `magicLink({ ... })` entry. Keep `expo()`, `bearer()`, `nextCookies()` (last). Update the `expo()` comment: the deep-link session handoff now serves **native OAuth callbacks**, not magic-link.
- Update the file's line-1 doc comment: "email + password, optional Google / Apple".

- [ ] **Step 4: Web client — `apps/web/src/lib/auth-client.ts`**

Remove `magicLinkClient()`. Result:

```ts
'use client';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient();

export const { useSession, signIn, signUp, signOut } = authClient;
```

(`signUp` newly exported for later tasks; `signIn.email` and the reset/verify methods are on the core client.)

- [ ] **Step 5: i18n keys (both locales, same step)**

Add to `packages/i18n/src/locales/cs.ts` and `en.ts` (parity required). EN values:

```ts
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.signInBtn': 'Sign in',
  'auth.signUpLink': "Don't have an account? Sign up",
  'auth.forgotLink': 'Forgot password?',
  'auth.err.invalidCredentials': 'Wrong email or password.',
  'auth.err.unverified': 'Verify your email first — check your inbox.',
```

CZ values: `'Email'`, `'Heslo'`, `'Přihlásit se'`, `'Nemáte účet? Zaregistrujte se'`, `'Zapomenuté heslo?'`, `'Nesprávný e-mail nebo heslo.'`, `'Nejdřív si ověřte e-mail — zkontrolujte schránku.'`. Remove any now-dead magic-link-only string (e.g. the old sign-in "check your inbox" copy if it was a keyed string; the current component uses an inline literal, so nothing to remove there).

- [ ] **Step 6: Web sign-in — `apps/web/src/components/sign-in.tsx`**

Replace the magic-link form (and the `sent`/`magic-sent` state) with an email+password form. Keep the Google/Apple block **unchanged**. New form section:

```tsx
async function submit(e: React.FormEvent) {
  e.preventDefault();
  setLoading(true);
  setError(null);
  const res = await signIn.email({ email, password, callbackURL: '/' });
  setLoading(false);
  if (res.error) {
    const code = res.error.code;
    setError(
      code === 'EMAIL_NOT_VERIFIED' ? t('auth.err.unverified') : t('auth.err.invalidCredentials'),
    );
  }
}
```

Form fields: the existing email `<Input>` plus a password `<Input type="password" autoComplete="current-password" data-testid="password-input">`. Submit button label `t('auth.signInBtn')`, `data-testid="signin-submit"`. Below the form: a `<Link href="/forgot-password">` (`t('auth.forgotLink')`, `data-testid="forgot-link"`) and a `<Link href="/sign-up">` (`t('auth.signUpLink')`, `data-testid="signup-link"`). Remove the `Mail` import if now unused. Keep the `error` `role="alert"` block.

- [ ] **Step 7: E2E helper — `apps/web/e2e/helpers.ts`**

Rewrite `signIn` to create the user via the sign-up API (auto-signs-in because verification is off under `AUTH_DEV_ECHO`), then exercise the real login form:

```ts
const TEST_PASSWORD = 'test-password-123';

/** Create a verified-in-dev user and sign in through the password form. */
export async function signIn(page: Page, email: string): Promise<void> {
  // Create the account (idempotent-ish per unique email); auto-signs-in in dev.
  await page.request.post('/api/auth/sign-up/email', {
    data: { name: email.split('@')[0], email, password: TEST_PASSWORD },
  });
  // Exercise the login form itself (drops the sign-up session first).
  await page.context().clearCookies();
  await page.goto('/');
  await page.getByLabel(/email/i).fill(email);
  await page.getByTestId('password-input').fill(TEST_PASSWORD);
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('new-group-btn')).toBeVisible();
}
```

- [ ] **Step 8: Run the gates**

```bash
export DATABASE_URL='postgresql://evenup:pass@localhost:55432/evenup'
pnpm --filter @evenup/web typecheck && pnpm --filter @evenup/web lint
pnpm --filter @evenup/i18n test          # parity
export ENCRYPTION_KEY='0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0' BETTER_AUTH_SECRET='test-secret-for-build-verification-only-000' AUTH_DEV_ECHO=true
pnpm --filter @evenup/web build && pnpm --filter @evenup/web test:e2e
```

Expected: typecheck/lint clean; i18n parity green; Playwright **56/56** (all critical flows now sign in via password). If a test other than sign-in fails, it's a real regression — fix it, don't skip.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(web): switch email login from magic link to email+password"
```

---

## Task 2: Web sign-up page

**Files:** Create `apps/web/src/components/sign-up.tsx`, `apps/web/src/app/sign-up/page.tsx`; modify `packages/i18n/src/locales/{cs,en}.ts`.

**Interfaces consumed:** `signUp.email` (Task 1). **Produced:** route `/sign-up`; testids `signup-name`, `signup-email`, `signup-password`, `signup-submit`, `signup-verify-sent`.

- [ ] **Step 1: i18n (both locales)** — add `auth.signUpTitle` ("Create your account" / "Vytvořte si účet"), `auth.name` ("Name" / "Jméno"), `auth.signUpBtn` ("Sign up" / "Zaregistrovat"), `auth.haveAccount` ("Already have an account? Sign in" / "Už máte účet? Přihlaste se"), `auth.verifySent` ("Check your inbox to verify your email." / "Zkontrolujte schránku a ověřte e-mail."), `auth.err.emailInUse` ("That email is already registered." / "Tento e-mail už je registrovaný.").

- [ ] **Step 2: Component `sign-up.tsx`** — a `<Card>` mirroring `sign-in.tsx`'s shell, with name + email + password fields and:

```tsx
const res = await signUp.email({ name, email, password });
if (res.error) {
  setError(
    res.error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
      ? t('auth.err.emailInUse')
      : t('error.generic'),
  );
} else {
  setSent(true); // show the "verify your email" panel (data-testid="signup-verify-sent")
}
```

**Anti-enumeration note (verified in `sign-up.mjs:161`):** when `requireEmailVerification` is on (prod), Better Auth returns a **generic** response for a duplicate email (no `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`) and skips auto-sign-in — to avoid leaking which emails are registered. So the `emailInUse` message only surfaces in **dev/E2E** (verification off); in prod a duplicate sign-up shows the normal "check your inbox" panel. That is intended; do not "fix" it.

Password `<Input type="password" autoComplete="new-password" minLength={8}>`. On success show the verify-sent panel (`t('auth.verifySent')`). Link back to `/` sign-in (`t('auth.haveAccount')`). Testids per the Interfaces block.

- [ ] **Step 3: Route `app/sign-up/page.tsx`** — `'use client'` page rendering `<SignUp />`, same layout wrapper as the home page's sign-in.

- [ ] **Step 4: Gates + commit** — `typecheck`, `lint`, `i18n test`; manually confirm `/sign-up` renders. `git commit -m "feat(web): email+password sign-up page"`.

---

## Task 3: Web forgot-password + reset-password

**Files:** Create `apps/web/src/app/forgot-password/page.tsx`, `apps/web/src/app/reset-password/page.tsx`; modify i18n.

**Interfaces consumed:** `authClient.requestPasswordReset`, `authClient.resetPassword` (Task 1). **Produced:** routes `/forgot-password`, `/reset-password`; testids `forgot-email`, `forgot-submit`, `forgot-sent`, `reset-password-input`, `reset-submit`, `reset-done`.

- [ ] **Step 1: i18n (both)** — `auth.forgotTitle`, `auth.forgotBtn` ("Send reset link"/"Poslat odkaz"), `auth.forgotSent` ("If that address exists, we sent a reset link."/"Pokud e-mail existuje, poslali jsme odkaz."), `auth.resetTitle`, `auth.newPassword` ("New password"/"Nové heslo"), `auth.resetBtn` ("Set new password"/"Nastavit heslo"), `auth.resetDone` ("Password changed — you can sign in."/"Heslo změněno — můžete se přihlásit."), `auth.err.resetToken` ("This reset link is invalid or expired."/"Odkaz je neplatný nebo vypršel.").

- [ ] **Step 2: `/forgot-password`** — email form:

```tsx
await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
setSent(true); // always show the same message (don't reveal whether the email exists)
```

Always show `t('auth.forgotSent')` on submit regardless of result (privacy).

- [ ] **Step 3: `/reset-password`** — read `token` from `useSearchParams()`; new-password form:

```tsx
const token = useSearchParams().get('token');
const res = await authClient.resetPassword({ newPassword, token: token ?? '' });
if (res.error) setError(t('auth.err.resetToken'));
else setDone(true); // show success + link to '/'
```

If `token` is absent, show the invalid-link message.

- [ ] **Step 4: Gates + commit** — `typecheck`/`lint`/`i18n`. `git commit -m "feat(web): forgot-password and reset-password flow"`.

---

## Task 4: Web verify-email pending screen + resend

**Files:** Create `apps/web/src/app/verify-email/pending/page.tsx`; modify i18n; the sign-up success panel (Task 2) links here.

**Interfaces consumed:** `authClient.sendVerificationEmail` (Task 1).

- [ ] **Step 1: i18n (both)** — `auth.verifyTitle` ("Verify your email"/"Ověřte e-mail"), `auth.verifyBody` ("We sent a link to {email}. Click it to finish."/"Poslali jsme odkaz na {email}. Klepnutím dokončíte."), `auth.resend` ("Resend"/"Poslat znovu"), `auth.resent` ("Sent."/"Odesláno.").

- [ ] **Step 2: Page** — reads `email` from `useSearchParams()`, shows the body, and a Resend button: (wrap the `useSearchParams()` consumer in a `<Suspense fallback={null}>` — Next 15 fails `next build` otherwise, same as reset-password)

```tsx
await authClient.sendVerificationEmail({ email, callbackURL: '/' });
```

Point the Task-2 sign-up success panel's "resend" affordance here (or inline the resend on the sign-up panel and keep this page for the deep-linked case). Keep it one small page.

- [ ] **Step 3: Gates + commit** — `git commit -m "feat(web): verify-email pending screen with resend"`.

---

## Task 5: Mobile password sign-in + remove magic-link plumbing

**Files:** Modify `apps/mobile/src/lib/auth.ts`, `apps/mobile/app/sign-in.tsx`; delete `apps/mobile/src/lib/magic-link-session.tsx` and drop its mount; modify i18n if any mobile-only strings.

**Interfaces consumed:** `signIn.email` (Task 1 exports on web; the mobile client exposes the same core methods). **Produced:** mobile password sign-in.

- [ ] **Step 1: Mobile client** — in `apps/mobile/src/lib/auth.ts` remove `magicLinkClient()` and its import; keep `expoClient(...)`. Export `signUp` too: `export const { useSession, signIn, signUp, signOut } = authClient;`.

- [ ] **Step 2: Remove magic-link deep-link capture** — `git rm apps/mobile/src/lib/magic-link-session.tsx`. Find its mount (`grep -rn "magic-link-session\|MagicLinkSession" apps/mobile`) and remove the JSX + import. Native Apple sign-in uses `idToken` → direct session (bearer), so no deep-link cookie capture is needed for the remaining flows.

- [ ] **Step 3: `app/sign-in.tsx`** — replace the magic-link form with email + password. Keep the native Apple button (`signInWithApple`) and its `appleBusy` guard exactly. New submit:

```tsx
const res = await signIn.email({ email, password });
if (res.error)
  setError(
    res.error.code === 'EMAIL_NOT_VERIFIED'
      ? t('auth.err.unverified')
      : t('auth.err.invalidCredentials'),
  );
else router.replace('/');
```

Add a `TextInput` with `secureTextEntry` for the password, a "Forgot password?" `Pressable` → `router.push('/forgot-password')`, and a "Sign up" `Pressable` → `router.push('/sign-up')`.

- [ ] **Step 4: Gates + commit** — `pnpm --filter @evenup/mobile typecheck && pnpm --filter @evenup/mobile lint` (must stay at exactly the 2 pre-existing `no-console` warnings). `git commit -m "feat(mobile): email+password sign-in; drop magic-link plumbing"`.

---

## Task 6: Mobile sign-up + forgot-password

**Files:** Create `apps/mobile/app/sign-up.tsx`, `apps/mobile/app/forgot-password.tsx`; modify i18n.

**Interfaces consumed:** `signUp.email`, `authClient.requestPasswordReset`.

- [ ] **Step 1: `app/sign-up.tsx`** — name + email + password RN screen (mirror `sign-in.tsx` styling) → `signUp.email({ name, email, password })` → on success show a "verify your email" message (RN `Text`), link back to sign-in. Reuse the `auth.*` i18n keys from Tasks 1-2.

- [ ] **Step 2: `app/forgot-password.tsx`** — email screen → `authClient.requestPasswordReset({ email, redirectTo: <WEB_URL>/reset-password })` → always show `t('auth.forgotSent')`. **The reset itself completes in the browser** (the emailed link opens the web page); the app implements no reset-token screen.

- [ ] **Step 3: Gates + commit** — mobile `typecheck` + `lint` (2 warnings). `git commit -m "feat(mobile): sign-up and forgot-password screens"`.

---

## Task 7: Full verification

**Files:** none.

- [ ] **Step 1: Every gate**

```bash
export DATABASE_URL='postgresql://evenup:pass@localhost:55432/evenup'
pnpm typecheck && pnpm lint && pnpm test
export ENCRYPTION_KEY='0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0' BETTER_AUTH_SECRET='test-secret-for-build-verification-only-000' AUTH_DEV_ECHO=true
pnpm --filter @evenup/web build && pnpm --filter @evenup/web test:e2e
```

Expected: typecheck 6/6; lint clean apart from the 2 pre-existing mobile warnings; unit suites green; Playwright 56/56. No `magicLink` / `magic-link-store` / `consumeMagicLink` references remain: `grep -rn "magicLink\|magic-link-store\|consumeMagicLink\|signIn.magicLink" apps packages --include="*.ts" --include="*.tsx" | grep -v node_modules` → no hits.

- [ ] **Step 2: Exercise the real password flow against a dev build** — with `AUTH_DEV_ECHO=true` (verification off), `pnpm --filter @evenup/web start` and curl:
  - `POST /api/auth/sign-up/email {name,email,password}` → 200, session set.
  - `POST /api/auth/sign-in/email {email,password}` → 200.
  - `POST /api/auth/sign-in/email {email, wrong password}` → 401.
  - Google/Apple `sign-in/social` still return their authorize URLs (unchanged).

- [ ] **Step 3: Record what is NOT covered** — the emailed verification + reset **links** end-to-end need #0 (SMTP); verified manually in staging once #0 lands. Not deployed to prod this cycle.

- [ ] **Step 4: Commit any fixes** — `git commit -m "chore: verification fixes for email+password"`.

---

## Deploy note (carry into the final review)

Per the spec's §3 deploy gate: **this branch is not deployed to production.** Enabling `emailAndPassword` in prod without #0 (SMTP) locks out existing magic-link users (their reset email never arrives) and breaks the old mobile magic-link path. The work is verified in dev/E2E; production enablement waits on #0 + a migration window.
