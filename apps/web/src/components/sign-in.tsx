'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { signIn, authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { Button, Card, Input, Label, PasswordInput } from '@/components/ui';
import { AppleLogo, GoogleLogo } from '@/components/icons';

// Only offer Google/Apple sign-in when the instance has configured them
// (self-hosters without credentials shouldn't see a dead button). Inlined at build.
const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true';
const appleEnabled = process.env.NEXT_PUBLIC_APPLE_ENABLED === 'true';

/**
 * `callbackURL` lets embedding pages (e.g. the invite page) get the user back
 * after auth instead of being dumped on the dashboard. Only same-origin paths
 * are accepted; anything else falls back to '/'.
 */
export function SignIn({ callbackURL = '/' }: { callbackURL?: string }) {
  const { t } = useI18n();
  const safeCallback = /^\/(?!\/)/.test(callbackURL) ? callbackURL : '/';
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
    // `onSuccess` is the only place the client types the 2FA-redirect payload
    // (`ctx.data.twoFactorRedirect`) leniently enough to read without a cast —
    // the awaited `res.data` below is typed strictly to the plain sign-in
    // response and doesn't know about the two-factor plugin's extra shape.
    const res = await signIn.email(
      { email, password, callbackURL: safeCallback },
      {
        onSuccess: (ctx) => {
          if (ctx.data?.twoFactorRedirect) setTwoFactor(true);
        },
      },
    );
    setLoading(false);
    if (res.error) {
      const errCode = res.error.code;
      setError(
        errCode === 'EMAIL_NOT_VERIFIED'
          ? t('auth.err.unverified')
          : t('auth.err.invalidCredentials'),
      );
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

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight" aria-label={t('app.name')}>
          Even<span className="text-brand-600">Up</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('app.tagline')}</p>
      </div>
      <Card>
        {twoFactor ? (
          <form onSubmit={submitTwoFactor} className="space-y-4">
            <div>
              <Label htmlFor="signin-2fa">
                {useBackup ? t('security.2fa.backupTitle') : t('security.2fa.code')}
              </Label>
              <Input
                id="signin-2fa"
                inputMode={useBackup ? 'text' : 'numeric'}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                data-testid="signin-2fa-code"
              />
            </div>
            {!useBackup ? (
              <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={trustDevice}
                  onChange={(e) => setTrustDevice(e.target.checked)}
                />
                {t('security.2fa.trustDevice')}
              </label>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {error}
              </p>
            ) : null}
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
              className="block text-sm text-brand-600 dark:text-brand-100"
              onClick={() => {
                setUseBackup(!useBackup);
                setCode('');
                setError(null);
              }}
            >
              {useBackup ? t('security.2fa.usePassword') : t('security.2fa.useBackup')}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <Label htmlFor="password">{t('auth.password')}</Label>
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
              {error ? (
                <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                  {error}
                </p>
              ) : null}
              <Button
                type="submit"
                disabled={loading}
                className="w-full"
                data-testid="signin-submit"
              >
                {loading ? t('common.loading') : t('auth.signInBtn')}
              </Button>
            </form>
            <div className="flex items-center justify-between text-sm">
              <Link
                href="/forgot-password"
                data-testid="forgot-link"
                className="text-brand-600 dark:text-brand-100"
              >
                {t('auth.forgotLink')}
              </Link>
              <Link
                href={
                  safeCallback === '/'
                    ? '/sign-up'
                    : `/sign-up?callbackURL=${encodeURIComponent(safeCallback)}`
                }
                data-testid="signup-link"
                className="text-brand-600 dark:text-brand-100"
              >
                {t('auth.signUpLink')}
              </Link>
            </div>
            {googleEnabled || appleEnabled ? (
              <>
                <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
                  {t('common.or')}
                  <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
                </div>
                {googleEnabled ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex w-full items-center justify-center gap-2"
                    onClick={() => signIn.social({ provider: 'google', callbackURL: safeCallback })}
                    data-testid="google-signin"
                  >
                    <GoogleLogo size={16} />
                    {t('auth.continueGoogle')}
                  </Button>
                ) : null}
                {appleEnabled ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex w-full items-center justify-center gap-2"
                    onClick={() => signIn.social({ provider: 'apple', callbackURL: safeCallback })}
                    data-testid="apple-signin"
                  >
                    <AppleLogo size={16} />
                    {t('auth.continueApple')}
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}
