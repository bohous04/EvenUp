'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { authClient } from '@/lib/auth-client';
import { Button, Card, Input, Label } from '@/components/ui';

function ResetPasswordForm() {
  const { t } = useI18n();
  const token = useSearchParams().get('token');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Guard against calling the API with an empty token — treat a missing
    // token the same as an invalid one rather than expecting success.
    if (!token) {
      setError(t('auth.err.resetToken'));
      return;
    }
    setLoading(true);
    setError(null);
    const res = await authClient.resetPassword({ newPassword, token });
    setLoading(false);
    if (res.error) {
      setError(t('auth.err.resetToken'));
    } else {
      setDone(true);
    }
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('auth.resetTitle')}</h1>
      </div>
      <Card>
        {done ? (
          <div className="space-y-4 text-center">
            <p data-testid="reset-done" className="text-sm text-zinc-700 dark:text-zinc-300">
              {t('auth.resetDone')}
            </p>
            <Link href="/" className="text-sm text-brand-600 dark:text-brand-100">
              {t('auth.signInBtn')}
            </Link>
          </div>
        ) : !token ? (
          <p role="alert" className="text-center text-sm text-red-700 dark:text-red-400">
            {t('auth.err.resetToken')}
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="new-password">{t('auth.newPassword')}</Label>
              <Input
                id="new-password"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                data-testid="reset-password-input"
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={loading} className="w-full" data-testid="reset-submit">
              {loading ? t('common.loading') : t('auth.resetBtn')}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams() requires a Suspense boundary so the route can still be
  // statically prerendered.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
