import type { MessageKey, InterpolationValues } from '@evenup/i18n';

type T = (key: MessageKey, values?: InterpolationValues) => string;

/** Map an activity action + payload to a localized, human-readable line (FR-9.1). */
export function describeActivity(
  action: string,
  payload: unknown,
  t: T,
  formatCurrency: (minor: number) => string,
  actorName: string | null,
): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  const actor = actorName ?? '—';
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  switch (action) {
    case 'group.created':
      return t('activity.created', { actor, item: str(p.name) });
    case 'member.added':
      return t('activity.created', { actor, item: str(p.name) });
    case 'expense.created':
      return t('activity.created', { actor, item: str(p.title) });
    case 'expenses.imported':
      return t('activity.created', {
        actor,
        item: `${Number(p.created ?? 0)}× ${t('expense.add')}`,
      });
    case 'settlement.recorded':
      return t('activity.settled', { actor, amount: formatCurrency(Number(p.amount ?? 0)) });
    case 'transaction.deleted':
      return t('activity.deleted', { actor, item: str(p.title) });
    case 'member.updated':
    case 'group.updated':
    case 'group.archived':
    case 'group.restored':
      return t('activity.edited', { actor, item: str(p.name) });
    default:
      return t('activity.edited', { actor, item: action });
  }
}
