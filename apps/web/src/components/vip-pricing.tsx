'use client';
import { useState } from 'react';
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
}: {
  summary: BillingSummary;
  onSubscribe: () => void;
  onBuy: (packId: string) => void;
  onPortal: () => void;
}) {
  const { t } = useI18n();
  const [acknowledged, setAcknowledged] = useState(false);

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
        <SectionLabel>{t('vip.title')}</SectionLabel>
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
          <Button onClick={onPortal} data-testid="vip-manage">
            {t('vip.manage')}
          </Button>
        ) : (
          <Button onClick={onSubscribe} data-testid="vip-subscribe">
            {t('vip.subscribe')}
          </Button>
        )}
      </Card>

      {summary.packs.length > 0 ? (
        <Card>
          <SectionLabel>{t('vip.credits.title')}</SectionLabel>
          <div className="mb-4 space-y-2">
            {summary.packs.map((pack) => (
              <div key={pack.id} className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {t('vip.credits.pack', { scans: pack.scans })}
                </span>
                <Button
                  variant="secondary"
                  disabled={!acknowledged}
                  onClick={() => onBuy(pack.id)}
                  data-testid={`vip-buy-${pack.id}`}
                >
                  {t('vip.credits.buy')}
                </Button>
              </div>
            ))}
          </div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500 dark:border-zinc-600"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              data-testid="vip-withdrawal-ack"
            />
            <span className="text-sm text-zinc-600 dark:text-zinc-300">{t('vip.credits.ack')}</span>
          </label>
        </Card>
      ) : null}
    </div>
  );
}
