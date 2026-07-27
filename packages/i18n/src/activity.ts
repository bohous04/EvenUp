import type { MessageKey, InterpolationValues } from './translate.js';

type T = (key: MessageKey, values?: InterpolationValues) => string;

/**
 * The activity actions the feed offers as a filter, in the order the pickers
 * list them. Kept here rather than in each client so web's `<select>` and
 * mobile's chip row can never drift apart.
 */
export const ACTIVITY_ACTIONS = [
  'group.created',
  'member.added',
  'member.joined',
  'member.updated',
  'expense.created',
  'expenses.imported',
  'settlement.recorded',
  'transaction.updated',
  'transaction.deleted',
  'group.updated',
  'group.archived',
  'group.restored',
  'category.created',
  'category.updated',
  'category.deleted',
] as const;

/**
 * Every payload field `describeActivity` below actually reads.
 *
 * Activity payloads are written by a dozen `logActivity` call sites and handed
 * to the read APIs as opaque JSON. Projecting onto this list server-side means a
 * future call site that logs something sensitive cannot leak it to the whole
 * group by default — it would have to be added here first. Add a field here
 * when, and only when, the switch below starts rendering it.
 */
export const ACTIVITY_PAYLOAD_FIELDS = ['name', 'title', 'created', 'amount'] as const;

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
    case 'category.created':
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
    case 'transaction.updated':
      return t('activity.edited', { actor, item: str(p.title) });
    case 'transaction.deleted':
      return t('activity.deleted', { actor, item: str(p.title) });
    case 'category.deleted':
      return t('activity.deleted', { actor, item: str(p.name) });
    case 'member.updated':
    case 'group.updated':
    case 'category.updated':
    case 'group.archived':
    case 'group.restored':
      return t('activity.edited', { actor, item: str(p.name) });
    default:
      return t('activity.edited', { actor, item: action });
  }
}
