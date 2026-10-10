'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { Button, Card, Input, Label } from '@/components/ui';
import { AuthError, AuthScreen } from '@/components/auth-screen';
import { Landmark } from '@/components/icons';

/**
 * First run after sign-up.
 *
 * Asks for the one thing that is genuinely useful to have early and impossible
 * to guess later — the bank account that Czech QR payments are issued from —
 * and says plainly why it is wanted, because an unexplained "we need your
 * account number" on a second screen is the kind of thing that ends an
 * otherwise-good signup.
 *
 * The account field, its validation and the "why" copy all already exist in
 * Settings; this is the same `setBankAccount` and the same message, surfaced
 * at the moment it is relevant. Skipping is a first-class choice: the flag is a
 * *timestamp*, so a user who declines is recorded as onboarded and never asked
 * again — the alternative (a boolean) makes "I said no" look identical to "you
 * haven't asked me yet", which is how people end up being nagged.
 */
export default function OnboardingPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();
  const utils = trpc.useUtils();
  const me = trpc.user.me.useQuery(undefined, { enabled: !!session?.user });
  const [account, setAccount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const markDone = trpc.user.updateSettings.useMutation({
    onSuccess: async () => {
      await utils.user.me.invalidate();
      router.replace('/groups');
    },
  });

  const setBank = trpc.user.setBankAccount.useMutation({
    onSuccess: () => markDone.mutate({ onboardingCompletedAt: new Date() }),
    onError: (e) => setError(e.message),
  });

  const busy = setBank.isPending || markDone.isPending;

  function skip() {
    markDone.mutate({ onboardingCompletedAt: new Date() });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = account.trim();
    if (!trimmed) {
      skip();
      return;
    }
    setError(null);
    setBank.mutate({ account: trimmed });
  }

  // A returning visitor is sent straight on — including one who came back
  // deliberately, who should never be re-prompted.
  if (!sessionPending && me.data?.onboardingCompletedAt) {
    return (
      <Card>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{t('common.loading')}</p>
      </Card>
    );
  }

  return (
    <AuthScreen
      icon={<Landmark size={20} strokeWidth={1.75} />}
      title={t('onboarding.title')}
      lede={t('onboarding.subtitle')}
    >
      <form onSubmit={submit} className="app-auth-form">
        <div>
          <Label htmlFor="onboarding-account">{t('profile.bankAccount')}</Label>
          <Input
            id="onboarding-account"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="19-2000145399/0800"
            inputMode="numeric"
            autoComplete="off"
            aria-describedby="onboarding-account-hint"
            className="tabular-nums"
            data-testid="onboarding-account-input"
          />
          {/* The "why", in the same words Settings uses — a promise the app
              keeps in two places should be made identically in two places. */}
          <p
            id="onboarding-account-hint"
            className="app-auth-hint"
            data-testid="onboarding-account-hint"
          >
            {t('profile.bankAccountHint')}
          </p>
        </div>

        {error ? <AuthError testId="onboarding-error">{error}</AuthError> : null}

        <div className="app-auth-actions">
          <Button
            type="submit"
            disabled={busy}
            className="w-full"
            data-testid="onboarding-continue"
          >
            {t('onboarding.continue')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={skip}
            className="w-full"
            data-testid="onboarding-skip"
          >
            {t('onboarding.skip')}
          </Button>
        </div>
      </form>
    </AuthScreen>
  );
}
