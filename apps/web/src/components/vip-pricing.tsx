'use client';
import { useId, useState } from 'react';
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
  const { t } = useI18n();
  const [acknowledged, setAcknowledged] = useState(false);
  const ackId = useId();

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
        <p className="mb-4 text-zinc-600 dark:text-zinc-300">{t('vip.subtitle')}</p>
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>{t('vip.benefit.scans')}</li>
          <li>{t('vip.benefit.storage')}</li>
          <li>{t('vip.benefit.cancel')}</li>
        </ul>
        <p className="mb-4 text-sm font-medium" data-testid="vip-balance">
          {t('vip.balance', { count: summary.creditBalance })}
        </p>
        {summary.subscription ? (
          <Button onClick={onPortal} disabled={pending} data-testid="vip-manage">
            {pending ? t('common.loading') : t('vip.manage')}
          </Button>
        ) : (
          <Button onClick={onSubscribe} disabled={pending} data-testid="vip-subscribe">
            {pending ? t('common.loading') : t('vip.subscribe')}
          </Button>
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
              return (
                <div key={pack.id} className="flex items-center justify-between gap-3">
                  <span id={packLabelId} className="text-sm font-medium">
                    {t('vip.credits.pack', { scans: pack.scans })}
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
