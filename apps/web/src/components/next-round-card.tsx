'use client';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Card } from '@/components/ui';
import { MemberChip } from '@/components/member-chip';
import { HandCoins } from '@/components/icons';

/**
 * Names who should pay the group's next shared expense, so balances drift toward
 * settled while the group spends. All math lives in `@evenup/core`; this renders.
 *
 * States are disjoint: `hidden` draws nothing (young, archived, or tiny group),
 * `square` says so, `suggested` names a payer and the next in line. The runner-up
 * is the whole skip mechanism — if the named member will not pay, the table can
 * already see who is next, with no button and no persisted state.
 */
export function NextRoundCard({ groupId, baseCurrency }: { groupId: string; baseCurrency: string }) {
  const { t, formatCurrency } = useI18n();
  const nextRound = trpc.balance.nextPayer.useQuery({ groupId });

  if (!nextRound.data || nextRound.data.state === 'hidden') return null;

  if (nextRound.data.state === 'square') {
    return (
      <Card data-testid="next-round-card">
        <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <HandCoins size={16} aria-hidden />
          {t('nextRound.square')}
        </p>
      </Card>
    );
  }

  const [payer, runnerUp] = nextRound.data.ranked;
  if (!payer) return null;

  return (
    <Card data-testid="next-round-card">
      <div className="flex items-center gap-3">
        <MemberChip initials={payer.initials} color={payer.color} name={payer.displayName} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold" data-testid="next-round-payer">
            <HandCoins size={16} aria-hidden />
            {t('nextRound.title', { name: payer.displayName })}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('nextRound.reason', {
              amount: formatCurrency(Math.abs(payer.balanceMinorUnits), baseCurrency),
            })}
          </p>
        </div>
      </div>

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
    </Card>
  );
}
