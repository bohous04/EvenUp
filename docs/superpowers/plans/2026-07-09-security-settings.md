# Security Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Security section to Settings for changing/setting a password, enabling TOTP 2FA with backup codes, and linking/unlinking Google & Apple to one account.

**Architecture:** Extend the existing Better Auth server with the `twoFactor` plugin (+ Prisma migration) and the client with `twoFactorClient()`. Add a `SecurityCard` composed of focused sub-components that call Better Auth client methods directly. Handle the 2FA sign-in step in-place in the existing sign-in card. Better Auth returns its own English error messages, so map its error codes to localized strings client-side.

**Tech Stack:** Next.js (App Router), Better Auth 1.2.x, Prisma/Postgres, Tailwind, `@evenup/i18n`, `qrcode`.

## Global Constraints

- Better Auth version floor: `better-auth@^1.2.9` (already installed). Do not upgrade.
- All user-facing strings go through `t(...)` from `@/lib/i18n`; add keys to BOTH `packages/i18n/src/locales/cs.ts` and `en.ts` (the i18n parity test enforces this). `cs` is canonical.
- Never emoji glyphs — use SVG icon components from `@/components/icons`.
- `nextCookies()` must remain the LAST entry in the server `plugins` array.
- Migrations auto-apply on deploy via `infra/docker/entrypoint.sh` (`prisma migrate deploy`). Do not add manual migration steps.
- Icons available: import from `@/components/icons`. Add any new lucide icon to both the import and the re-export block in `apps/web/src/components/icons.tsx`.
- Verify each change with `pnpm --filter web typecheck`, `pnpm --filter @evenup/i18n test`, and `pnpm --filter web lint` before committing.

---

### Task 1: Backend — twoFactor plugin, schema, migration, client

**Files:**

- Modify: `apps/web/src/server/auth.ts`
- Modify: `apps/web/src/lib/auth-client.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_two_factor/migration.sql` (generated)
- Modify: `packages/api/src/routers/user.ts` (add `twoFactorEnabled` to `me`)

**Interfaces:**

- Produces: server `auth` now supports `authClient.twoFactor.*`; `authClient.listAccounts/linkSocial/unlinkAccount/changePassword` (built-in); `user.me` returns `twoFactorEnabled: boolean`.

- [ ] **Step 1: Add the twoFactor plugin to the server**

In `apps/web/src/server/auth.ts`, add the import and `appName`, and add `twoFactor` to plugins (before `nextCookies()`):

```ts
import { bearer, twoFactor } from 'better-auth/plugins';
```

In the `betterAuth({...})` config object add `appName: 'EvenUp',` near `baseURL`, and change the plugins array to:

```ts
  plugins: [
    twoFactor({ issuer: 'EvenUp' }),
    expo(),
    bearer(),
    nextCookies(), // must be last
  ],
```

- [ ] **Step 2: Add the twoFactor client plugin**

Replace `apps/web/src/lib/auth-client.ts` body with:

```ts
'use client';
import { createAuthClient } from 'better-auth/react';
import { twoFactorClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [twoFactorClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
```

- [ ] **Step 3: Add the Prisma schema fields**

In `packages/db/prisma/schema.prisma`, add to the `User` model:

```prisma
  twoFactorEnabled Boolean   @default(false)
  twoFactor        TwoFactor[]
```

Add a new model (place near the other auth models):

```prisma
model TwoFactor {
  id          String @id @default(cuid())
  userId      String
  user        User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  secret      String
  backupCodes String

  @@map("twoFactor")
}
```

- [ ] **Step 4: Generate the migration + client**

Run (requires a local Postgres — see the E2E recipe, Postgres on 55433):

```bash
DATABASE_URL=postgresql://evenup:pass@localhost:55433/evenup \
  pnpm --filter @evenup/db exec prisma migrate dev --name two_factor
pnpm --filter @evenup/db generate
```

Expected: a new `migrations/<ts>_two_factor/migration.sql` creating the `twoFactor` table and `User.twoFactorEnabled`.

If no local DB is available, hand-write the migration SQL to match the schema and run `prisma generate` only; the diff must match `prisma migrate diff`.

- [ ] **Step 5: Expose twoFactorEnabled from user.me**

In `packages/api/src/routers/user.ts`, add `twoFactorEnabled: true,` to the `select` block in `me`. It flows out via `...rest` automatically.

- [ ] **Step 6: Verify + commit**

```bash
pnpm --filter web typecheck && pnpm --filter @evenup/api typecheck && pnpm --filter @evenup/db exec prisma validate
git add apps/web/src/server/auth.ts apps/web/src/lib/auth-client.ts packages/db/prisma packages/api/src/routers/user.ts
git commit -m "feat(auth): add TOTP two-factor plugin, schema, migration"
```

---

### Task 2: i18n keys + localized Better-Auth error helper

**Files:**

- Modify: `packages/i18n/src/locales/cs.ts`, `packages/i18n/src/locales/en.ts`
- Create: `apps/web/src/lib/auth-errors.ts`
- Create: `apps/web/src/lib/auth-errors.test.ts`

**Interfaces:**

- Produces: `authErrorMessage(code: string | undefined, t: (k: MessageKey) => string): string` — maps a Better Auth error code to a localized string, defaulting to `t('security.error.generic')`.

- [ ] **Step 1: Add i18n keys**

Add to `en.ts` (and Czech equivalents to `cs.ts`, canonical):

```ts
  // Security settings
  'security.title': 'Security',                       // cs: 'Zabezpečení'
  'security.password.title': 'Password',              // cs: 'Heslo'
  'security.password.change': 'Change password',      // cs: 'Změnit heslo'
  'security.password.current': 'Current password',    // cs: 'Současné heslo'
  'security.password.new': 'New password',            // cs: 'Nové heslo'
  'security.password.changed': 'Password changed',    // cs: 'Heslo změněno'
  'security.password.setVia': 'You sign in with Google/Apple. Set a password to also sign in with email.', // cs: 'Přihlašujete se přes Google/Apple. Nastavte si heslo, abyste se mohli přihlásit i e-mailem.'
  'security.password.sendSetLink': 'Send a set-password link', // cs: 'Poslat odkaz pro nastavení hesla'
  'security.password.setLinkSent': 'Check your email for the link.', // cs: 'Zkontrolujte e-mail s odkazem.'
  'security.linked.title': 'Login methods',           // cs: 'Způsoby přihlášení'
  'security.linked.password': 'Email + password',     // cs: 'E-mail + heslo'
  'security.linked.link': 'Link',                     // cs: 'Propojit'
  'security.linked.unlink': 'Unlink',                 // cs: 'Odpojit'
  'security.linked.connected': 'Connected',           // cs: 'Propojeno'
  'security.linked.lastMethod': "You can't remove your only login method.", // cs: 'Nemůžete odebrat svůj jediný způsob přihlášení.'
  'security.2fa.title': 'Two-factor authentication',  // cs: 'Dvoufázové ověření'
  'security.2fa.on': 'On',                            // cs: 'Zapnuto'
  'security.2fa.off': 'Off',                          // cs: 'Vypnuto'
  'security.2fa.enable': 'Enable 2FA',                // cs: 'Zapnout 2FA'
  'security.2fa.disable': 'Disable 2FA',              // cs: 'Vypnout 2FA'
  'security.2fa.needPassword': 'Set a password first to enable 2FA.', // cs: 'Pro zapnutí 2FA si nejprve nastavte heslo.'
  'security.2fa.scan': 'Scan this in your authenticator app, then enter the 6-digit code.', // cs: 'Naskenujte v aplikaci autentikátoru a zadejte 6místný kód.'
  'security.2fa.secret': 'Or enter this key manually', // cs: 'Nebo zadejte tento klíč ručně'
  'security.2fa.code': '6-digit code',                // cs: '6místný kód'
  'security.2fa.confirm': 'Confirm',                  // cs: 'Potvrdit'
  'security.2fa.backupTitle': 'Backup codes',         // cs: 'Záložní kódy'
  'security.2fa.backupHint': 'Save these somewhere safe. Each works once.', // cs: 'Uložte si je bezpečně. Každý funguje jednou.'
  'security.2fa.download': 'Download',                // cs: 'Stáhnout'
  'security.2fa.done': 'Done',                        // cs: 'Hotovo'
  'security.2fa.trustDevice': 'Trust this device',    // cs: 'Důvěřovat tomuto zařízení'
  'security.2fa.useBackup': 'Use a backup code',      // cs: 'Použít záložní kód'
  'security.2fa.usePassword': 'Back',                 // cs: 'Zpět'
  'security.error.generic': 'Something went wrong. Try again.', // cs: 'Něco se nepovedlo. Zkuste to znovu.'
  'security.error.invalidPassword': 'Incorrect password.', // cs: 'Nesprávné heslo.'
  'security.error.invalidCode': 'Invalid or expired code.', // cs: 'Neplatný nebo vypršelý kód.'
```

- [ ] **Step 2: Write the failing test for the error helper**

Create `apps/web/src/lib/auth-errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { authErrorMessage } from './auth-errors';

const t = (k: string) => k; // identity: assert on the KEY chosen

describe('authErrorMessage', () => {
  it('maps invalid password codes', () => {
    expect(authErrorMessage('INVALID_PASSWORD', t as never)).toBe('security.error.invalidPassword');
    expect(authErrorMessage('CREDENTIAL_ACCOUNT_NOT_FOUND', t as never)).toBe(
      'security.error.invalidPassword',
    );
  });
  it('maps invalid 2FA code', () => {
    expect(authErrorMessage('INVALID_TWO_FACTOR_CODE', t as never)).toBe(
      'security.error.invalidCode',
    );
    expect(authErrorMessage('INVALID_BACKUP_CODE', t as never)).toBe('security.error.invalidCode');
  });
  it('falls back to generic for unknown/undefined', () => {
    expect(authErrorMessage(undefined, t as never)).toBe('security.error.generic');
    expect(authErrorMessage('WHATEVER', t as never)).toBe('security.error.generic');
  });
});
```

- [ ] **Step 3: Run test (fails — module missing)**

Run: `pnpm --filter web exec vitest run src/lib/auth-errors.test.ts`
Expected: FAIL (cannot find `./auth-errors`).

- [ ] **Step 4: Implement the helper**

Create `apps/web/src/lib/auth-errors.ts`:

```ts
import type { MessageKey } from '@evenup/i18n';

/** Map a Better Auth error code to a localized message key + translate it. */
export function authErrorMessage(code: string | undefined, t: (key: MessageKey) => string): string {
  switch (code) {
    case 'INVALID_PASSWORD':
    case 'CREDENTIAL_ACCOUNT_NOT_FOUND':
      return t('security.error.invalidPassword');
    case 'INVALID_TWO_FACTOR_CODE':
    case 'INVALID_BACKUP_CODE':
    case 'OTP_EXPIRED':
      return t('security.error.invalidCode');
    default:
      return t('security.error.generic');
  }
}
```

- [ ] **Step 5: Run tests + i18n parity + commit**

```bash
pnpm --filter web exec vitest run src/lib/auth-errors.test.ts   # PASS
pnpm --filter @evenup/i18n test                                  # PASS (parity)
pnpm --filter web typecheck
git add apps/web/src/lib/auth-errors.ts apps/web/src/lib/auth-errors.test.ts packages/i18n/src/locales
git commit -m "feat(web): security i18n strings + Better Auth error mapping"
```

---

### Task 3: PasswordSection component

**Files:**

- Create: `apps/web/src/components/security/password-section.tsx`

**Interfaces:**

- Consumes: `authClient.changePassword`, `authClient.requestPasswordReset`, `authErrorMessage`.
- Produces: `<PasswordSection hasPassword={boolean} email={string} />`.

- [ ] **Step 1: Implement**

Create `apps/web/src/components/security/password-section.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useI18n } from '@/lib/i18n';
import { authErrorMessage } from '@/lib/auth-errors';
import { Button, Label, PasswordInput, SectionLabel } from '@/components/ui';

export function PasswordSection({ hasPassword, email }: { hasPassword: boolean; email: string }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!hasPassword) {
    return (
      <div>
        <SectionLabel>{t('security.password.title')}</SectionLabel>
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          {t('security.password.setVia')}
        </p>
        <Button
          variant="secondary"
          disabled={busy}
          data-testid="set-password-btn"
          onClick={async () => {
            setBusy(true);
            setErr(null);
            const res = await authClient.requestPasswordReset({
              email,
              redirectTo: '/reset-password',
            });
            setBusy(false);
            if (res.error) setErr(authErrorMessage(res.error.code, t));
            else setMsg(t('security.password.setLinkSent'));
          }}
        >
          {t('security.password.sendSetLink')}
        </Button>
        {msg ? <p className="mt-2 text-sm text-green-700 dark:text-green-400">{msg}</p> : null}
        {err ? (
          <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
            {err}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        setMsg(null);
        const res = await authClient.changePassword({
          currentPassword: current,
          newPassword: next,
          revokeOtherSessions: true,
        });
        setBusy(false);
        if (res.error) {
          setErr(authErrorMessage(res.error.code, t));
        } else {
          setMsg(t('security.password.changed'));
          setCurrent('');
          setNext('');
        }
      }}
    >
      <SectionLabel>{t('security.password.title')}</SectionLabel>
      <div>
        <Label htmlFor="cur-pw">{t('security.password.current')}</Label>
        <PasswordInput
          id="cur-pw"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          data-testid="current-password"
        />
      </div>
      <div>
        <Label htmlFor="new-pw">{t('security.password.new')}</Label>
        <PasswordInput
          id="new-pw"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={8}
          data-testid="new-password"
        />
      </div>
      <Button type="submit" disabled={busy} data-testid="change-password-btn">
        {t('security.password.change')}
      </Button>
      {msg ? <p className="text-sm text-green-700 dark:text-green-400">{msg}</p> : null}
      {err ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {err}
        </p>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm --filter web typecheck && pnpm --filter web lint
git add apps/web/src/components/security/password-section.tsx
git commit -m "feat(web): security password change / set section"
```

Note: `PasswordInput` and `requestPasswordReset` signatures already exist in the codebase (`ui.tsx`, `forgot-password/page.tsx`). Confirm `changePassword`/`requestPasswordReset` return `{ error?: { code?, message } }` at runtime; adjust the `res.error` access if the client shape differs (Better Auth returns `{ data, error }`).

---

### Task 4: LinkedAccountsSection component

**Files:**

- Create: `apps/web/src/components/security/linked-accounts-section.tsx`

**Interfaces:**

- Consumes: `authClient.listAccounts`, `authClient.linkSocial`, `authClient.unlinkAccount`, `authErrorMessage`.
- Produces: `<LinkedAccountsSection googleEnabled={boolean} appleEnabled={boolean} />`.

- [ ] **Step 1: Implement**

Create `apps/web/src/components/security/linked-accounts-section.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useI18n } from '@/lib/i18n';
import { authErrorMessage } from '@/lib/auth-errors';
import { Button, SectionLabel } from '@/components/ui';
import { GoogleLogo, AppleLogo } from '@/components/icons';

type Provider = 'google' | 'apple';

export function LinkedAccountsSection({
  googleEnabled,
  appleEnabled,
}: {
  googleEnabled: boolean;
  appleEnabled: boolean;
}) {
  const { t } = useI18n();
  const [providers, setProviders] = useState<string[] | null>(null); // providerIds from listAccounts
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const res = await authClient.listAccounts();
    if (res.data) setProviders(res.data.map((a) => a.providerId ?? a.provider));
    else setErr(authErrorMessage(res.error?.code, t));
  };
  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const has = (p: string) => providers?.includes(p) ?? false;
  // "credential" is the email+password account; count total login methods.
  const methodCount = (providers ?? []).length;

  const social: {
    id: Provider;
    label: string;
    enabled: boolean;
    Logo: React.FC<{ size?: number }>;
  }[] = [
    { id: 'google', label: 'Google', enabled: googleEnabled, Logo: GoogleLogo },
    { id: 'apple', label: 'Apple', enabled: appleEnabled, Logo: AppleLogo },
  ];

  return (
    <div>
      <SectionLabel>{t('security.linked.title')}</SectionLabel>
      <ul className="space-y-2" data-testid="linked-accounts">
        <li className="flex items-center justify-between text-sm">
          <span>{t('security.linked.password')}</span>
          <span className="text-zinc-500 dark:text-zinc-400">
            {has('credential') ? t('security.linked.connected') : '—'}
          </span>
        </li>
        {social
          .filter((s) => s.enabled)
          .map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <s.Logo size={16} /> {s.label}
              </span>
              {has(s.id) ? (
                <Button
                  variant="ghost"
                  disabled={methodCount <= 1}
                  title={methodCount <= 1 ? t('security.linked.lastMethod') : undefined}
                  data-testid={`unlink-${s.id}`}
                  onClick={async () => {
                    const res = await authClient.unlinkAccount({ providerId: s.id });
                    if (res.error) setErr(authErrorMessage(res.error.code, t));
                    else void load();
                  }}
                >
                  {t('security.linked.unlink')}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  data-testid={`link-${s.id}`}
                  onClick={() =>
                    authClient.linkSocial({ provider: s.id, callbackURL: '/settings' })
                  }
                >
                  {t('security.linked.link')}
                </Button>
              )}
            </li>
          ))}
      </ul>
      {err ? (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {err}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm --filter web typecheck && pnpm --filter web lint
git add apps/web/src/components/security/linked-accounts-section.tsx
git commit -m "feat(web): linked login methods (Google/Apple) section"
```

Note: confirm the shape returned by `authClient.listAccounts()` at runtime — Better Auth returns account rows with `providerId` (e.g. `'credential'`, `'google'`, `'apple'`). Adjust `.map`/`has()` if the field name differs (`provider` vs `providerId`); the code already falls back.

---

### Task 5: TwoFactorSection component

**Files:**

- Create: `apps/web/src/components/security/two-factor-section.tsx`

**Interfaces:**

- Consumes: `authClient.twoFactor.enable/verifyTotp/disable`, `qrcode`, `authErrorMessage`.
- Produces: `<TwoFactorSection enabled={boolean} hasPassword={boolean} onChanged={() => void} />`.

- [ ] **Step 1: Implement**

Create `apps/web/src/components/security/two-factor-section.tsx`:

```tsx
'use client';
import { useState } from 'react';
import QRCode from 'qrcode';
import { authClient } from '@/lib/auth-client';
import { useI18n } from '@/lib/i18n';
import { authErrorMessage } from '@/lib/auth-errors';
import { Button, Label, PasswordInput, Input, SectionLabel } from '@/components/ui';

type Stage = 'idle' | 'password' | 'verify' | 'backup';

export function TwoFactorSection({
  enabled,
  hasPassword,
  onChanged,
}: {
  enabled: boolean;
  hasPassword: boolean;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [stage, setStage] = useState<Stage>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!hasPassword) {
    return (
      <div>
        <SectionLabel>{t('security.2fa.title')}</SectionLabel>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('security.2fa.needPassword')}</p>
      </div>
    );
  }

  async function startEnable() {
    setBusy(true);
    setErr(null);
    const res = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (res.error || !res.data) {
      setErr(authErrorMessage(res.error?.code, t));
      return;
    }
    setBackupCodes(res.data.backupCodes ?? []);
    const uri = res.data.totpURI as string;
    const url = new URL(uri);
    setSecret(url.searchParams.get('secret') ?? '');
    setQr(await QRCode.toDataURL(uri, { margin: 1, width: 200 }));
    setStage('verify');
  }

  async function confirmCode() {
    setBusy(true);
    setErr(null);
    const res = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (res.error) {
      setErr(authErrorMessage(res.error.code, t));
      return;
    }
    setStage('backup'); // show backup codes, then Done
  }

  async function disable() {
    setBusy(true);
    setErr(null);
    const res = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (res.error) {
      setErr(authErrorMessage(res.error.code, t));
      return;
    }
    reset();
    onChanged();
  }

  function reset() {
    setStage('idle');
    setPassword('');
    setCode('');
    setQr('');
    setSecret('');
    setBackupCodes([]);
    setErr(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel className="mb-0">{t('security.2fa.title')}</SectionLabel>
        <span
          className={`text-sm font-semibold ${enabled ? 'text-green-700 dark:text-green-400' : 'text-zinc-500'}`}
          data-testid="2fa-status"
        >
          {enabled ? t('security.2fa.on') : t('security.2fa.off')}
        </span>
      </div>

      {stage === 'idle' && !enabled ? (
        <Button
          variant="secondary"
          data-testid="enable-2fa-btn"
          onClick={() => setStage('password')}
        >
          {t('security.2fa.enable')}
        </Button>
      ) : null}
      {stage === 'idle' && enabled ? (
        <Button variant="danger" data-testid="disable-2fa-btn" onClick={() => setStage('password')}>
          {t('security.2fa.disable')}
        </Button>
      ) : null}

      {stage === 'password' ? (
        <div className="space-y-2">
          <Label htmlFor="tfa-pw">{t('security.password.current')}</Label>
          <PasswordInput
            id="tfa-pw"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="2fa-password"
          />
          <div className="flex gap-2">
            <Button
              disabled={busy || !password}
              data-testid="2fa-password-continue"
              onClick={enabled ? disable : startEnable}
            >
              {t('security.2fa.confirm')}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {stage === 'verify' ? (
        <div className="space-y-2">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('security.2fa.scan')}</p>
          {qr ? (
            <img
              src={qr}
              alt={t('security.2fa.title')}
              width={200}
              height={200}
              className="rounded-lg bg-white p-2"
            />
          ) : null}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('security.2fa.secret')}</p>
          <code className="block break-all text-xs" data-testid="2fa-secret">
            {secret}
          </code>
          <Label htmlFor="tfa-code">{t('security.2fa.code')}</Label>
          <Input
            id="tfa-code"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            data-testid="2fa-code"
          />
          <Button
            disabled={busy || code.length < 6}
            data-testid="2fa-confirm-btn"
            onClick={confirmCode}
          >
            {t('security.2fa.confirm')}
          </Button>
        </div>
      ) : null}

      {stage === 'backup' ? (
        <div className="space-y-2" data-testid="2fa-backup">
          <SectionLabel>{t('security.2fa.backupTitle')}</SectionLabel>
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {t('security.2fa.backupHint')}
          </p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
            {backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                const blob = new Blob([backupCodes.join('\n')], { type: 'text/plain' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'evenup-backup-codes.txt';
                a.click();
              }}
            >
              {t('security.2fa.download')}
            </Button>
            <Button
              data-testid="2fa-done-btn"
              onClick={() => {
                reset();
                onChanged();
              }}
            >
              {t('security.2fa.done')}
            </Button>
          </div>
        </div>
      ) : null}

      {err ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {err}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm --filter web typecheck && pnpm --filter web lint
git add apps/web/src/components/security/two-factor-section.tsx
git commit -m "feat(web): 2FA enable (QR + backup codes) / disable section"
```

Note: `twoFactor.enable` returns `{ totpURI, backupCodes }` (per Better Auth 1.2.9 docs). If `enable` on this version does NOT return `totpURI` directly, fall back to `authClient.twoFactor.getTotpUri({ password })` after enable. Verify at runtime and adjust `startEnable`.

---

### Task 6: Wire SecurityCard into the Settings page

**Files:**

- Create: `apps/web/src/components/security/security-card.tsx`
- Modify: `apps/web/src/app/settings/page.tsx`

**Interfaces:**

- Consumes: `trpc.user.me` (`twoFactorEnabled`), `authClient.listAccounts` (to detect `hasPassword`), env flags `NEXT_PUBLIC_GOOGLE_ENABLED` / `NEXT_PUBLIC_APPLE_ENABLED`.
- Produces: `<SecurityCard />`.

- [ ] **Step 1: Implement the card**

Create `apps/web/src/components/security/security-card.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { authClient, useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { Card, SectionLabel } from '@/components/ui';
import { PasswordSection } from './password-section';
import { LinkedAccountsSection } from './linked-accounts-section';
import { TwoFactorSection } from './two-factor-section';

export function SecurityCard() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const me = trpc.user.me.useQuery(undefined, { enabled: !!session?.user });
  const utils = trpc.useUtils();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  useEffect(() => {
    void authClient.listAccounts().then((res) => {
      const ids = res.data?.map((a) => a.providerId ?? a.provider) ?? [];
      setHasPassword(ids.includes('credential'));
    });
  }, []);

  if (!session?.user || !me.data || hasPassword === null) return null;
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true';
  const appleEnabled = process.env.NEXT_PUBLIC_APPLE_ENABLED === 'true';

  return (
    <Card>
      <SectionLabel>{t('security.title')}</SectionLabel>
      <div className="mt-3 space-y-6">
        <PasswordSection hasPassword={hasPassword} email={session.user.email} />
        <LinkedAccountsSection googleEnabled={googleEnabled} appleEnabled={appleEnabled} />
        <TwoFactorSection
          enabled={me.data.twoFactorEnabled ?? false}
          hasPassword={hasPassword}
          onChanged={() => void utils.user.me.invalidate()}
        />
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Mount it in Settings**

In `apps/web/src/app/settings/page.tsx`, import `SecurityCard` and render `<SecurityCard />` as a new card (place it after the Profile card, before the OpenRouter card).

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter web typecheck && pnpm --filter web lint
git add apps/web/src/components/security/security-card.tsx apps/web/src/app/settings/page.tsx
git commit -m "feat(web): Security card in Settings (password, methods, 2FA)"
```

---

### Task 7: Sign-in 2FA step (in-place)

**Files:**

- Modify: `apps/web/src/components/sign-in.tsx`

**Interfaces:**

- Consumes: `authClient.signIn.email` (`onSuccess` → `data.twoFactorRedirect`), `authClient.twoFactor.verifyTotp/verifyBackupCode`, `authErrorMessage`.

- [ ] **Step 1: Read the current sign-in component**

Run: `sed -n '1,140p' apps/web/src/components/sign-in.tsx` and locate the `signIn.email(...)` call and the post-success navigation.

- [ ] **Step 2: Add a 2FA step**

Add local state `const [twoFactor, setTwoFactor] = useState(false)`, `const [code, setCode] = useState('')`, `const [useBackup, setUseBackup] = useState(false)`, `const [trustDevice, setTrustDevice] = useState(false)`.

Wrap the existing `signIn.email` call with an `onSuccess` callback that inspects the redirect and switches to the 2FA step instead of navigating:

```tsx
await authClient.signIn.email(
  { email, password },
  {
    onSuccess: (ctx) => {
      if (ctx.data?.twoFactorRedirect) setTwoFactor(true);
      else router.push('/'); // keep the existing post-login navigation
    },
    onError: (ctx) => setError(authErrorMessage(ctx.error?.code, t)),
  },
);
```

When `twoFactor` is true, render this block instead of the email/password form (keep the same card shell):

```tsx
<form
  onSubmit={async (e) => {
    e.preventDefault();
    const verify = useBackup
      ? authClient.twoFactor.verifyBackupCode({ code })
      : authClient.twoFactor.verifyTotp({ code, trustDevice });
    const res = await verify;
    if (res.error) setError(authErrorMessage(res.error.code, t));
    else router.push('/');
  }}
  className="space-y-3"
>
  <Label htmlFor="signin-2fa">
    {useBackup ? t('security.2fa.backupTitle') : t('security.2fa.code')}
  </Label>
  <Input
    id="signin-2fa"
    inputMode={useBackup ? 'text' : 'numeric'}
    value={code}
    onChange={(e) => setCode(e.target.value)}
    autoFocus
    data-testid="signin-2fa-code"
  />
  {!useBackup ? (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={trustDevice}
        onChange={(e) => setTrustDevice(e.target.checked)}
      />
      {t('security.2fa.trustDevice')}
    </label>
  ) : null}
  <Button type="submit" data-testid="signin-2fa-submit">
    {t('security.2fa.confirm')}
  </Button>
  <button
    type="button"
    className="block text-sm text-brand-600"
    onClick={() => {
      setUseBackup(!useBackup);
      setCode('');
    }}
  >
    {useBackup ? t('security.2fa.usePassword') : t('security.2fa.useBackup')}
  </button>
</form>
```

Use whatever `router`/navigation and `Input`/`Label`/`Button` imports the file already uses. Match the existing error-display element.

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter web typecheck && pnpm --filter web lint
git add apps/web/src/components/sign-in.tsx
git commit -m "feat(web): 2FA code step in sign-in"
```

---

### Task 8: Integration smoke test + manual verification checklist

**Files:**

- Create: `packages/api/src/routers/two-factor.test.ts` (optional integration smoke — requires a local DB)

**Interfaces:**

- Consumes: the Better Auth server `auth.api` methods.

- [ ] **Step 1: Optional 2FA integration smoke (only if a local Postgres is available)**

Add `otpauth` as a devDependency of `apps/web` (`pnpm --filter web add -D otpauth`). Drive the Better Auth server directly: sign up a user, call `auth.api.enableTwoFactor({ body: { password }, headers })`, parse the `secret` from the returned `totpURI`, generate a code with `otpauth`, call `auth.api.verifyTOTP`, assert `user.twoFactorEnabled === true`, then `disableTwoFactor` and assert it flips back. If the server API surface differs from the client, skip this test and rely on manual verification — do NOT block the feature on it.

- [ ] **Step 2: Manual verification checklist (run against the deployed build)**

Verify each, since the interactive flows aren't fully E2E-covered:

- Change password with correct/incorrect current password (incorrect → localized error).
- OAuth-only account: password section shows "set a password"; the email link works.
- Link Google/Apple → returns to `/settings` showing Connected; unlink; the last remaining method's Unlink is disabled.
- Enable 2FA: QR scans, wrong code → localized error, correct code → backup codes shown once.
- Sign out, sign in: after password, prompted for a code; correct code logs in; "use a backup code" works; wrong code → localized error.
- Disable 2FA with password; sign-in no longer prompts.
- Toggle locale to EN and confirm all Security strings + errors are English.

- [ ] **Step 3: Commit (if a test was added)**

```bash
git add packages/api/src/routers/two-factor.test.ts apps/web/package.json
git commit -m "test(api): two-factor enable/verify/disable smoke"
```

---

## Self-Review

- **Spec coverage:** Backend setup (Task 1), password change/set (Task 3), OAuth link/unlink + last-method guard (Task 4), 2FA enable/QR/backup/disable (Task 5), sign-in 2FA step (Task 7), i18n + Better Auth error mapping (Task 2), settings placement (Task 6), testing/deploy (Task 8, Global Constraints). All spec sections mapped.
- **Placeholder scan:** No TBD/TODO. Runtime-shape caveats are called out explicitly with fallbacks (listAccounts field, enable return, auth API surface) — these are real "verify the library shape" notes, not deferred work.
- **Type consistency:** `authErrorMessage(code, t)` signature identical across Tasks 2–7. `hasPassword`/`enabled` props consistent between `SecurityCard` and sections. `onChanged` used consistently.

## Execution Handoff

See prompt after saving.
