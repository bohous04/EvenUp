'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { authClient } from '@/lib/auth-client';
import { Button, Card } from '@/components/ui';

function VerifyEmailPending() {
  const { t } = useI18n();
  const email = useSearchParams().get('email') ?? '';
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  async function resend() {
    setLoading(true);
    await authClient.sendVerificationEmail({ email, callbackURL: '/' });
    setLoading(false);
    setResent(true);
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('auth.verifyTitle')}</h1>
      </div>
      <Card>
        <div className="space-y-4 text-center">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {t('auth.verifyBody', { email })}
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={loading || !email}
            onClick={resend}
            className="w-full"
            data-testid="verify-resend"
          >
            {loading ? t('common.loading') : t('auth.resend')}
          </Button>
          {resent ? (
            <p data-testid="verify-resent" className="text-sm text-zinc-700 dark:text-zinc-300">
              {t('auth.resent')}
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

export default function VerifyEmailPendingPage() {
  // useSearchParams() requires a Suspense boundary so the route can still be
  // statically prerendered.
  return (
    <Suspense fallback={null}>
      <VerifyEmailPending />
    </Suspense>
  );
}
