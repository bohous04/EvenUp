'use client';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { MemberChip } from '@/components/member-chip';
import { Check } from '@/components/icons';

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
/**
 * Advice, not a list: an insight tile right under your position card
 * (`.app-gd-round`, app.css "group r2") — a filled plate with no hairline, so
 * it reads as the group's one computed remark and never as another list. The
 * payer's face, the kicker "Next round", the headline at row-title size in
 * ink, and the reason with the runner-up on one meta line.
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

  const title = t('nextRound.label');

  if (data.state === 'square') {
    return (
      <section className="app-gd-round" data-testid="next-round-card" aria-label={title}>
        <span className="app-gd-round-glyph" aria-hidden>
          <Check size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="app-gd-round-kicker">{title}</h2>
          <p className="app-gd-round-title">{t('nextRound.square')}</p>
        </div>
      </section>
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
    <section className="app-gd-round" data-testid="next-round-card" aria-label={title}>
      <div className="app-gd-round-faces">
        {payers.slice(0, 3).map((p) => (
          <span key={p.memberId} className="app-gd-round-face">
            <MemberChip
              initials={p.initials}
              color={p.color}
              name={p.displayName}
              imageUrl={p.image}
            />
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="app-gd-round-kicker">{title}</h2>
        <p className="app-gd-round-title" data-testid="next-round-payer">
          {t(clearsGate ? 'nextRound.title' : 'nextRound.titleBehind', { names })}
        </p>
        <p className="app-gd-round-meta">
          {t(tied ? 'nextRound.reasonEach' : 'nextRound.reason', {
            amount: formatCurrency(Math.abs(lead.balanceMinorUnits), baseCurrency),
          })}
          {runnerUp.length > 0 ? (
            <>
              <span aria-hidden> · </span>
              <span data-testid="next-round-runner-up">
                {t('nextRound.runnerUp', {
                  names: formatNameList(
                    runnerUp.map((r) => r.displayName),
                    'conjunction',
                  ),
                  amount: formatCurrency(Math.abs(runnerUp[0]!.balanceMinorUnits), baseCurrency),
                })}
              </span>
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}
