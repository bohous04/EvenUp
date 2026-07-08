'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { signIn } from '@/lib/auth-client';
import { Button, Card, Input, Label } from '@/components/ui';
import { AppleLogo } from '@/components/icons';

// Only offer Google/Apple sign-in when the instance has configured them
// (self-hosters without credentials shouldn't see a dead button). Inlined at build.
const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true';
const appleEnabled = process.env.NEXT_PUBLIC_APPLE_ENABLED === 'true';

export function SignIn() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn.email({ email, password, callbackURL: '/' });
    setLoading(false);
    if (res.error) {
      const code = res.error.code;
      setError(
        code === 'EMAIL_NOT_VERIFIED'
          ? t('auth.err.unverified')
          : t('auth.err.invalidCredentials'),
      );
    }
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">{t('app.name')}</h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">{t('app.tagline')}</p>
      </div>
      <Card>
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
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                data-testid="password-input"
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
            <Link href="/forgot-password" data-testid="forgot-link" className="text-blue-600 dark:text-blue-400">
              {t('auth.forgotLink')}
            </Link>
            <Link href="/sign-up" data-testid="signup-link" className="text-blue-600 dark:text-blue-400">
              {t('auth.signUpLink')}
            </Link>
          </div>
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
        </div>
      </Card>
    </div>
  );
}
