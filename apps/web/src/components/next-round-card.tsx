'use client';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Card } from '@/components/ui';
import { MemberChip } from '@/components/member-chip';
import { Sparkles } from '@/components/icons';

/**
 * Names who should buy the group's next shared round (design 2026-07-10). Read-only,
 * all math server-side (`balance.nextPayer`): hidden below 3 expenses / archived /
 * <2 members, a "you're all square" line when nobody qualifies, otherwise the
 * deepest qualifying debtor with a runner-up so the table can see who's next.
 */
export function NextRoundCard({
  groupId,
  baseCurrency,
}: {
  groupId: string;
  baseCurrency: string;
}) {
  const { t, formatCurrency } = useI18n();
  const nextPayer = trpc.balance.nextPayer.useQuery({ groupId });

  const data = nextPayer.data;
  if (!data || data.state === 'hidden') return null;

  if (data.state === 'square') {
    return (
      <Card data-testid="next-round-card">
        <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <Sparkles size={18} aria-hidden className="shrink-0 text-brand-600 dark:text-brand-100" />
          {t('nextRound.square')}
        </p>
      </Card>
    );
  }

  const [payer, runnerUp] = data.ranked;
  if (!payer) return null;

  return (
    <Card data-testid="next-round-card">
      <div className="flex items-start gap-3">
        <Sparkles
          size={20}
          aria-hidden
          className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-100"
        />
        <div className="min-w-0 flex-1">
          <p className="font-bold tracking-tight" data-testid="next-round-payer">
            {t('nextRound.title', { name: payer.displayName })}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            <MemberChip
              initials={payer.initials}
              color={payer.color}
              name={payer.displayName}
              size="sm"
            />
            {t('nextRound.reason', {
              amount: formatCurrency(Math.abs(payer.balanceMinorUnits), baseCurrency),
            })}
          </p>
          {runnerUp ? (
            <p
              className="mt-2 border-t border-zinc-100 pt-2 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
              data-testid="next-round-runner-up"
            >
              {t('nextRound.runnerUp', {
                name: runnerUp.displayName,
                amount: formatCurrency(runnerUp.balanceMinorUnits, baseCurrency),
              })}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
