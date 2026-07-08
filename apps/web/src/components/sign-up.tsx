'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { signUp } from '@/lib/auth-client';
import { Button, Card, Input, Label } from '@/components/ui';

export function SignUp() {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signUp.email({ name, email, password });
    setLoading(false);
    if (res.error) {
      setError(
        res.error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
          ? t('auth.err.emailInUse')
          : t('error.generic'),
      );
    } else {
      setSent(true);
    }
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">{t('app.name')}</h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">{t('auth.signUpTitle')}</p>
      </div>
      <Card>
        {sent ? (
          <div className="space-y-4 text-center">
            <p data-testid="signup-verify-sent" className="text-sm text-neutral-700 dark:text-neutral-300">
              {t('auth.verifySent')}
            </p>
            <Link
              href={`/verify-email/pending?email=${encodeURIComponent(email)}`}
              className="text-sm text-blue-600 dark:text-blue-400"
              data-testid="verify-email-link"
            >
              {t('auth.resend')}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="name">{t('auth.name')}</Label>
                <Input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  data-testid="signup-name"
                />
              </div>
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
                  data-testid="signup-email"
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
                  autoComplete="new-password"
                  minLength={8}
                  data-testid="signup-password"
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
                data-testid="signup-submit"
              >
                {loading ? t('common.loading') : t('auth.signUpBtn')}
              </Button>
            </form>
            <div className="text-center text-sm">
              <Link href="/" data-testid="signin-link" className="text-blue-600 dark:text-blue-400">
                {t('auth.haveAccount')}
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
