'use client';
import { useState } from 'react';
import { AppLink } from '@/components/app-link';
import { useI18n } from '@/lib/i18n';
import { signIn, authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { Button, Input, Label, PasswordInput } from '@/components/ui';
import { AuthError, AuthScreen } from '@/components/auth-screen';
import { AppleLogo, GoogleLogo } from '@/components/icons';

// Only offer Google/Apple sign-in when the instance has configured them
// (self-hosters without credentials shouldn't see a dead button). Inlined at build.
const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true';
const appleEnabled = process.env.NEXT_PUBLIC_APPLE_ENABLED === 'true';

/**
 * `callbackURL` lets embedding pages (e.g. the invite page) get the user back
 * after auth instead of being dumped on the dashboard. Only same-origin paths
 * are accepted; anything else falls back to the dashboard.
 *
 * That default is `/groups`, not `/`: `/` is the public landing page now, and
 * sending someone who just signed in back to the marketing site would look
 * like the sign-in silently failed.
 */
const DASHBOARD = '/groups';

export function SignIn({ callbackURL = DASHBOARD }: { callbackURL?: string }) {
  const { t } = useI18n();
  const safeCallback = /^\/(?!\/)/.test(callbackURL) ? callbackURL : DASHBOARD;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // 2FA step: shown in place of the email/password form when the account
  // requires a second factor. Navigation after a successful verify is the
  // same as the normal path below — the session atom updates reactively and
  // the parent page (e.g. `app/page.tsx`) swaps away from `<SignIn>` itself,
  // so no explicit redirect is needed here either.
  const [twoFactor, setTwoFactor] = useState(false);
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn.email({ email, password, callbackURL: safeCallback });
    setLoading(false);
    if (res.error) {
      const errCode = res.error.code;
      setError(
        errCode === 'EMAIL_NOT_VERIFIED'
          ? t('auth.err.unverified')
          : t('auth.err.invalidCredentials'),
      );
      return;
    }
    // When the account has 2FA, Better Auth creates no session and returns
    // `{ twoFactorRedirect: true }` (a normal sign-in redirects via `callbackURL`
    // instead). Read it off the awaited response — the strict sign-in type omits
    // the two-factor plugin's extra field, so narrow with a cast. (The per-call
    // `onSuccess` fetch callback did not fire reliably here.)
    if ((res.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
      setTwoFactor(true);
    }
  }

  async function submitTwoFactor(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice });
    setLoading(false);
    if (res.error) setError(authErrorMessage(res.error.code, t));
  }

  const signUpHref =
    safeCallback === DASHBOARD
      ? '/sign-up'
      : `/sign-up?callbackURL=${encodeURIComponent(safeCallback)}`;

  if (twoFactor) {
    return (
      <AuthScreen
        title={t('security.2fa.title')}
        footer={
          <button
            type="button"
            className="app-auth-alt"
            onClick={() => {
              setTwoFactor(false);
              setCode('');
              setUseBackup(false);
              setError(null);
            }}
          >
            {t('auth.backToSignIn')}
          </button>
        }
      >
        <form onSubmit={submitTwoFactor} className="app-auth-form">
          <div>
            <Label htmlFor="signin-2fa">
              {useBackup ? t('security.2fa.backupTitle') : t('security.2fa.code')}
            </Label>
            <Input
              id="signin-2fa"
              inputMode={useBackup ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              className="app-auth-code"
              data-testid="signin-2fa-code"
            />
          </div>
          {!useBackup ? (
            <label className="app-auth-check">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
              />
              <span>{t('security.2fa.trustDevice')}</span>
            </label>
          ) : null}
          {error ? <AuthError>{error}</AuthError> : null}
          <Button
            type="submit"
            disabled={loading}
            className="w-full"
            data-testid="signin-2fa-submit"
          >
            {loading ? t('common.loading') : t('security.2fa.confirm')}
          </Button>
          <button
            type="button"
            className="app-auth-link app-auth-link-center"
            onClick={() => {
              setUseBackup(!useBackup);
              setCode('');
              setError(null);
            }}
          >
            {useBackup ? t('security.2fa.usePassword') : t('security.2fa.useBackup')}
          </button>
        </form>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title={t('auth.signInTitle')}
      lede={t('auth.signInLede')}
      footer={
        <>
          <p className="app-auth-q">{t('auth.noAccount')}</p>
          <AppLink href={signUpHref} data-testid="signup-link" className="app-auth-alt">
            {t('auth.createAccount')}
          </AppLink>
        </>
      }
    >
      {googleEnabled || appleEnabled ? (
        <div className="app-auth-social">
          {googleEnabled ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => signIn.social({ provider: 'google', callbackURL: safeCallback })}
              data-testid="google-signin"
            >
              <GoogleLogo size={18} />
              {t('auth.continueGoogle')}
            </Button>
          ) : null}
          {appleEnabled ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => signIn.social({ provider: 'apple', callbackURL: safeCallback })}
              data-testid="apple-signin"
            >
              <AppleLogo size={18} />
              {t('auth.continueApple')}
            </Button>
          ) : null}
          <p className="app-auth-or">
            <span>{t('common.or')}</span>
          </p>
        </div>
      ) : null}
      <form onSubmit={submit} className="app-auth-form">
        <div>
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
        <div>
          <div className="app-auth-label-row">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <AppLink href="/forgot-password" data-testid="forgot-link" className="app-auth-link">
              {t('auth.forgotLink')}
            </AppLink>
          </div>
          <PasswordInput
            id="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            data-testid="password-input"
            showLabel={t('auth.showPassword')}
            hideLabel={t('auth.hidePassword')}
          />
        </div>
        {error ? <AuthError>{error}</AuthError> : null}
        <Button type="submit" disabled={loading} className="w-full" data-testid="signin-submit">
          {loading ? t('common.loading') : t('auth.signInBtn')}
        </Button>
      </form>
    </AuthScreen>
  );
}
