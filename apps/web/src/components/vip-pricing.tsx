'use client';
import { useId, useState } from 'react';
import { TRIMMED_PRICE_FORMAT } from '@evenup/i18n';
import {
  displayPackPriceMinor,
  displaySubscriptionPriceMinor,
} from '@evenup/api/billing/display-prices';
import { useI18n } from '@/lib/i18n';
import { Button, Card, SectionLabel } from '@/components/ui';
import type { RouterOutputs } from '@/lib/trpc';

export type BillingSummary = RouterOutputs['billing']['summary'];

/**
 * Presentational pricing panel — takes its data and callbacks as props (no
 * tRPC of its own) so it's testable in isolation. The withdrawal-right
 * checkbox is local state shared by every pack row: none of them may fire a
 * purchase until it's checked, mirroring the server's independent rejection
 * of `acknowledgeImmediate: false` in `billing.checkoutCredits`.
 *
 * Prices come from `display-prices.ts` — a presentation-only copy of what is
 * configured on the Stripe prices, since `summary.packs` carries only Stripe
 * price ids and never an amount. They are rendered through the locale-aware
 * `formatCurrency` in the currency `billing.summary` resolved for this user,
 * so the panel shows CZK or EUR exactly as checkout will. A pack size with no
 * display price renders without one rather than with a wrong one.
 *
 * Prices are advertised as round numbers — "50 Kč", "€2" — not as ledger
 * amounts, via `TRIMMED_PRICE_FORMAT`. The public price list
 * (`app/[locale]/(marketing)/page.tsx`) imports the very same constant, so the
 * two pages cannot quote different-looking prices for one product.
 */
export function VipPricing({
  summary,
  onSubscribe,
  onBuy,
  onPortal,
  pending = false,
}: {
  summary: BillingSummary;
  onSubscribe: () => void;
  onBuy: (packId: string) => void;
  onPortal: () => void;
  /**
   * True while any of the three purchase mutations is in flight. Deliberately
   * coarse — the round trip includes `stripe.checkout.sessions.create` and,
   * on a first purchase, `stripe.customers.create`, so it can take a second
   * or more. Gating every button on one flag (rather than tracking each
   * mutation separately) means a click on any of them disables all of them,
   * so a double-click can't open two Stripe checkout sessions.
   */
  pending?: boolean;
}) {
  const { t, formatCurrency, formatDate } = useI18n();
  const [acknowledged, setAcknowledged] = useState(false);
  const ackId = useId();
  // `trialing` is healthy; `past_due`, `unpaid` and `incomplete` all mean a
  // payment needs the customer's attention before the subscription lapses.
  const status = summary.subscription?.status;
  const needsPaymentAttention =
    status !== undefined && status !== 'active' && status !== 'trialing';
  // Healthy, but not the same as `active`: nothing has been charged yet and
  // the customer needs to see when that changes. While trialing, Stripe sets
  // the period to the trial window, so `currentPeriodEnd` *is* the trial end
  // and therefore the date of the first payment.
  const isTrialing = status === 'trialing';

  if (!summary.billingEnabled) {
    return (
      <Card>
        <p className="text-zinc-600 dark:text-zinc-300">{t('vip.disabled')}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <SectionLabel>{t('vip.subscription.title')}</SectionLabel>
        <p className="mb-1 text-2xl font-extrabold tracking-tight" data-testid="vip-price">
          {t('vip.price.month', {
            price: formatCurrency(
              displaySubscriptionPriceMinor(summary.currency),
              summary.currency,
              TRIMMED_PRICE_FORMAT,
            ),
          })}
        </p>
        <p className="mb-4 text-zinc-600 dark:text-zinc-300">{t('vip.subtitle')}</p>
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>{t('vip.benefit.scans')}</li>
          {/* The retention window comes from `billing.summary`, which reads the
              same `config/retention.ts` helper as the cleanup job and the legal
              pages. This bullet used to promise storage with no end date while
              the cron deleted the photos on schedule — and the terms, which
              sell exactly this benefit, quote the same number. */}
          <li>{t('vip.benefit.storage', { days: summary.receiptRetentionDays })}</li>
          <li>{t('vip.benefit.cancel')}</li>
        </ul>
        <p className="mb-4 text-sm font-medium" data-testid="vip-balance">
          {t('vip.balance', { count: summary.creditBalance })}
        </p>
        {/* A subscription in ANY non-terminal state — `past_due` and
            `unpaid` included — means the customer already has one, so the
            portal is the only thing to offer. Keying this on `status ===
            'active'` is what used to invite a customer whose card had just
            expired to buy a *second* subscription; `billing.summary` now
            reports the whole set (see `TERMINAL_SUBSCRIPTION_STATUSES`), and
            `checkoutSubscription` refuses server-side regardless of what
            this renders — the UI alone cannot fix the two-tab race. */}
        {summary.subscription ? (
          <>
            {needsPaymentAttention ? (
              <p
                role="status"
                className="mb-3 rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2 text-sm font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/20 dark:text-amber-200"
                data-testid="vip-payment-problem"
              >
                {t('vip.subscription.paymentProblem')}
              </p>
            ) : null}
            {isTrialing ? (
              <p
                role="status"
                // Only the brand steps `globals.css` actually defines
                // (50/100/500/600/700) — an undefined `brand-300` or
                // `brand-950` renders as no style at all, silently.
                className="mb-3 rounded-lg border border-brand-500/40 bg-brand-50/70 px-3 py-2 text-sm font-medium text-brand-700 dark:bg-brand-600/10 dark:text-brand-100"
                data-testid="vip-trialing"
              >
                {t('vip.subscription.trialing', {
                  date: formatDate(summary.subscription.currentPeriodEnd),
                })}
              </p>
            ) : null}
            <Button onClick={onPortal} disabled={pending} data-testid="vip-manage">
              {pending ? t('common.loading') : t('vip.manage')}
            </Button>
          </>
        ) : summary.subscriptionAvailable ? (
          // Two audiences behind one button. `trialEligible` comes from the
          // server because `subscription === null` cannot tell a first-time
          // buyer from someone who cancelled — and `checkoutSubscription`
          // grants the trial to the first and refuses it to the second, so a
          // label guessed on the client could promise a week checkout will not
          // give.
          <>
            <Button onClick={onSubscribe} disabled={pending} data-testid="vip-subscribe">
              {pending
                ? t('common.loading')
                : summary.trialEligible
                  ? t('vip.trial.subscribe', { trialDays: summary.trialDays })
                  : t('vip.subscribe')}
            </Button>
            {/* Below the button, but written before the click matters: Stripe
                collects a card for a trialing subscription, and "free trial"
                with no card warning is the single most common source of "I
                never agreed to this" disputes. */}
            {summary.trialEligible ? (
              <p
                className="mt-3 text-sm text-zinc-600 dark:text-zinc-300"
                data-testid="vip-trial-note"
              >
                {t('vip.trial.note', { trialDays: summary.trialDays })}
              </p>
            ) : null}
          </>
        ) : (
          // `billingEnabled` is only "STRIPE_SECRET_KEY is set"; the VIP price
          // id is a separate variable per currency. Rendering the button when
          // the price for THIS request's currency is missing meant every
          // English user's click came back PRECONDITION_FAILED. Packs are a
          // separate configuration, so the pack card below still stands.
          <p className="text-sm text-zinc-600 dark:text-zinc-300" data-testid="vip-unavailable">
            {t('vip.subscription.unavailable')}
          </p>
        )}
      </Card>

      {summary.packs.length > 0 ? (
        <Card>
          <SectionLabel>{t('vip.credits.title')}</SectionLabel>
          {/* Above the pack rows: a disabled button is out of the tab order,
              so an assistive-tech user who met the buttons first would land on
              unexplained, unavailable controls with the explanation only
              afterwards. */}
          <label className="mb-4 flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500 dark:border-zinc-600"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              data-testid="vip-withdrawal-ack"
            />
            <span id={ackId} className="text-sm text-zinc-600 dark:text-zinc-300">
              {t('vip.credits.ack')}
            </span>
          </label>
          <div className="space-y-2">
            {summary.packs.map((pack) => {
              // Production renders one row per configured pack size (2/5/10
              // scans) with otherwise-identical "Buy"/"Koupit" buttons — link
              // each to its own pack label so a screen-reader user can tell
              // them apart instead of hearing the same name three times.
              const packLabelId = `${ackId}-pack-${pack.id}`;
              const priceMinor = displayPackPriceMinor(summary.currency, pack.scans);
              return (
                <div key={pack.id} className="flex items-center justify-between gap-3">
                  {/* The price is inside the label element so it is part of
                      the Buy button's `aria-describedby` announcement — a
                      screen-reader user hears "5 scans, 50,00 Kč" rather than
                      an unpriced pack name. */}
                  <span id={packLabelId} className="text-sm font-medium">
                    {t('vip.credits.pack', { scans: pack.scans })}
                    {priceMinor === undefined ? null : (
                      <span
                        className="ml-2 font-semibold text-zinc-600 dark:text-zinc-300"
                        data-testid={`vip-price-${pack.id}`}
                      >
                        {formatCurrency(priceMinor, summary.currency, TRIMMED_PRICE_FORMAT)}
                      </span>
                    )}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={!acknowledged || pending}
                    aria-describedby={packLabelId}
                    onClick={() => onBuy(pack.id)}
                    data-testid={`vip-buy-${pack.id}`}
                  >
                    {pending ? t('common.loading') : t('vip.credits.buy')}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
