'use client';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { Card } from '@/components/ui';
import { VipPricing } from '@/components/vip-pricing';

/**
 * Stripe's Checkout Session and Billing Portal `url` fields are typed
 * `string | null` — Stripe returns null only in edge cases we don't expect
 * here, but the type must be satisfied before handing it to `location.href`.
 */
function goTo(url: string | null | undefined) {
  if (url) window.location.href = url;
}

export default function VipPage() {
  const { t } = useI18n();
  const { data: session, isPending } = useSession();
  const summary = trpc.billing.summary.useQuery(undefined, { enabled: !!session?.user });

  const checkoutSubscription = trpc.billing.checkoutSubscription.useMutation({
    onSuccess: (data) => goTo(data.url),
  });
  const checkoutCredits = trpc.billing.checkoutCredits.useMutation({
    onSuccess: (data) => goTo(data.url),
  });
  const portal = trpc.billing.portal.useMutation({
    onSuccess: (data) => goTo(data.url),
  });

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
      {summary.data ? (
        <VipPricing
          summary={summary.data}
          onSubscribe={() => checkoutSubscription.mutate()}
          // The checkbox in VipPricing already gates every Buy button, so
          // this is always true here — the server independently re-checks
          // it in `billing.checkoutCredits`, and the two are meant to agree.
          onBuy={(packId) => checkoutCredits.mutate({ packId, acknowledgeImmediate: true })}
          onPortal={() => portal.mutate()}
        />
      ) : (
        <p className="text-zinc-500 dark:text-zinc-400">…</p>
      )}
      <Link href="/" className="inline-block text-brand-700 underline">
        ← {t('nav.groups')}
      </Link>
    </div>
  );
}
