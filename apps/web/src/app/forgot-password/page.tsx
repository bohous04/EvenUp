'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { authClient } from '@/lib/auth-client';
import { Button, Card, Input, Label } from '@/components/ui';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
    setLoading(false);
    // Always show the same confirmation, regardless of whether the email
    // exists — never reveal account existence to the caller.
    setSent(true);
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('auth.forgotTitle')}</h1>
      </div>
      <Card>
        {sent ? (
          <p
            data-testid="forgot-sent"
            className="text-center text-sm text-zinc-700 dark:text-zinc-300"
          >
            {t('auth.forgotSent')}
          </p>
        ) : (
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
                data-testid="forgot-email"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full" data-testid="forgot-submit">
              {loading ? t('common.loading') : t('auth.forgotBtn')}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
