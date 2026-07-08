'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { signIn } from '@/lib/auth-client';
import { Button, Card, Input, Label } from '@/components/ui';
import { Mail, AppleLogo } from '@/components/icons';

// Only offer Google/Apple sign-in when the instance has configured them
// (self-hosters without credentials shouldn't see a dead button). Inlined at build.
const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true';
const appleEnabled = process.env.NEXT_PUBLIC_APPLE_ENABLED === 'true';

export function SignIn() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn.magicLink({ email, callbackURL: '/' });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? t('error.generic'));
    } else {
      setSent(true);
    }
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">{t('app.name')}</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">{t('app.tagline')}</p>
      </div>
      <Card>
        {sent ? (
          <p
            data-testid="magic-sent"
            className="flex items-center justify-center gap-2 text-center text-sm"
          >
            <Mail size={16} aria-hidden /> {t('invite.link')} — check your inbox to finish signing
            in.
          </p>
        ) : (
          <div className="space-y-4">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
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
              {error ? (
                <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? t('common.loading') : 'Sign in with email'}
              </Button>
            </form>
            {googleEnabled || appleEnabled ? (
              <>
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
                  {t('common.or')}
                  <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
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
        )}
      </Card>
    </div>
  );
}
