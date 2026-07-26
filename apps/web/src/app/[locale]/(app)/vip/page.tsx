'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { Button, Card } from '@/components/ui';
import { VipPricing } from '@/components/vip-pricing';

/**
 * Navigate to a Stripe-hosted URL, reporting whether it actually happened.
 * Stripe's Checkout Session and Billing Portal `url` fields are typed
 * `string | null` — Stripe returns null only in edge cases we don't expect
 * here, but a falsy url must surface as an error to the caller rather than
 * silently doing nothing (the previous version left the button looking like
 * it did nothing at all).
 */
function goTo(url: string | null | undefined): boolean {
  if (!url) return false;
  window.location.href = url;
  return true;
}

export default function VipPage() {
  const { t } = useI18n();
  const { data: session, isPending } = useSession();
  const summary = trpc.billing.summary.useQuery(undefined, { enabled: !!session?.user });
  // Shared by all three purchase mutations below: whichever one fails (an
  // unconfigured price, an expired checkout session, a transient Stripe or
  // network error, or a success response with no url) leaves a legible
  // message here instead of the button doing nothing.
  const [error, setError] = useState<string | null>(null);

  function handleCheckoutSuccess(data: { url: string | null }) {
    if (!goTo(data.url)) setError(t('error.generic'));
  }

  const checkoutSubscription = trpc.billing.checkoutSubscription.useMutation({
    onSuccess: handleCheckoutSuccess,
    onError: (e) => setError(e.message),
  });
  const checkoutCredits = trpc.billing.checkoutCredits.useMutation({
    onSuccess: handleCheckoutSuccess,
    onError: (e) => setError(e.message),
  });
  const portal = trpc.billing.portal.useMutation({
    onSuccess: handleCheckoutSuccess,
    onError: (e) => setError(e.message),
  });
  // Coarse on purpose: the round trip includes `stripe.checkout.sessions.create`
  // and, on a first purchase, `stripe.customers.create`, so it can sit for a
  // second or more. Disabling every button while ANY of the three mutations is
  // in flight stops a double-click from opening two Stripe checkout sessions
  // (and possibly creating two Stripe customers).
  const pending = checkoutSubscription.isPending || checkoutCredits.isPending || portal.isPending;

  if (isPending) return <p className="text-zinc-500 dark:text-zinc-400">…</p>;
  if (!session?.user) {
    return (
      <Card>
        <Link href="/" className="text-brand-700 underline">
          {t('common.back')}
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{t('vip.title')}</h1>
      {error ? (
        <p
          role="alert"
          className="text-sm font-medium text-red-700 dark:text-red-400"
          data-testid="vip-error"
        >
          {error}
        </p>
      ) : null}
      {summary.isPending ? (
        <p className="text-zinc-500 dark:text-zinc-400">…</p>
      ) : summary.isError || !summary.data ? (
        // TanStack Query retries 3× by default, then settles `isPending` to
        // false with `data` still undefined forever — conflating that with
        // the pending state left a user returning from a successful Stripe
        // payment stuck on a bare ellipsis, with no error and no way to
        // retry. Branch separately and offer a real retry affordance.
        <Card>
          <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-400">
            {t('error.generic')}
          </p>
          <Button
            variant="secondary"
            onClick={() => summary.refetch()}
            data-testid="vip-summary-retry"
          >
            {t('common.retry')}
          </Button>
        </Card>
      ) : (
        <VipPricing
          summary={summary.data}
          pending={pending}
          onSubscribe={() => {
            setError(null);
            checkoutSubscription.mutate();
          }}
          // The checkbox in VipPricing already gates every Buy button, so
          // this is always true here — the server independently re-checks
          // it in `billing.checkoutCredits`, and the two are meant to agree.
          onBuy={(packId) => {
            setError(null);
            checkoutCredits.mutate({ packId, acknowledgeImmediate: true });
          }}
          onPortal={() => {
            setError(null);
            portal.mutate();
          }}
        />
      )}
      <Link href="/" className="inline-block text-brand-700 underline">
        ← {t('nav.groups')}
      </Link>
    </div>
  );
}
