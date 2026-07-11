'use client';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Card } from '@/components/ui';
import { MemberChip } from '@/components/member-chip';
import { HandCoins } from '@/components/icons';

/**
 * Names who should buy the group's next shared round, so balances drift toward
 * settled while the group spends. All math lives in `@evenup/core`; this renders.
 *
 * States are disjoint: `hidden` draws nothing (young, archived, or tiny group),
 * `square` says so, `suggested` names every debtor tied at the deepest debt. The
 * gate is tone, not veto: when paying a typical round evens up *every* named
 * payer, the title is a confident disjunction ("one of you pays"); otherwise it
 * is a soft conjunction, a statement of fact. The runner-up line — shown only
 * when a single payer is named — is the skip mechanism: if that member will not
 * pay, the table already sees who is next, with no button and no persisted state.
 */
export function NextRoundCard({
  groupId,
  baseCurrency,
}: {
  groupId: string;
  baseCurrency: string;
}) {
  const { t, formatCurrency, formatNameList } = useI18n();
  const nextRound = trpc.balance.nextPayer.useQuery({ groupId });

  const data = nextRound.data;
  if (!data || data.state === 'hidden') return null;

  if (data.state === 'square') {
    return (
      <Card data-testid="next-round-card">
        <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <HandCoins size={16} aria-hidden />
          {t('nextRound.square')}
        </p>
      </Card>
    );
  }

  const { payers, runnerUp, clearsGate } = data;
  const [lead] = payers;
  if (!lead) return null;

  // Every payer is tied at the deepest debt, so any one carries the shared reason.
  const tied = payers.length > 1;
  const names = formatNameList(
    payers.map((p) => p.displayName),
    clearsGate ? 'disjunction' : 'conjunction',
  );

  return (
    <Card data-testid="next-round-card">
      <div className="flex items-center gap-3">
        <div className="flex -space-x-1.5">
          {payers.slice(0, 3).map((p) => (
            <MemberChip
              key={p.memberId}
              initials={p.initials}
              color={p.color}
              name={p.displayName}
            />
          ))}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold" data-testid="next-round-payer">
            <HandCoins size={16} aria-hidden />
            {t(clearsGate ? 'nextRound.title' : 'nextRound.titleBehind', { names })}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t(tied ? 'nextRound.reasonEach' : 'nextRound.reason', {
              amount: formatCurrency(Math.abs(lead.balanceMinorUnits), baseCurrency),
            })}
          </p>
        </div>
      </div>

      {runnerUp.length > 0 ? (
        <p
          className="mt-2 border-t border-zinc-100 pt-2 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
          data-testid="next-round-runner-up"
        >
          {t('nextRound.runnerUp', {
            names: formatNameList(
              runnerUp.map((r) => r.displayName),
              'conjunction',
            ),
            amount: formatCurrency(Math.abs(runnerUp[0]!.balanceMinorUnits), baseCurrency),
          })}
        </p>
      ) : null}
    </Card>
  );
}
