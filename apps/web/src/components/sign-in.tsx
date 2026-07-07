'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { signIn } from '@/lib/auth-client';
import { Button, Card, Input, Label } from '@/components/ui';
import { Mail } from '@/components/icons';

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
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">{t('app.tagline')}</p>
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
        )}
      </Card>
    </div>
  );
}
