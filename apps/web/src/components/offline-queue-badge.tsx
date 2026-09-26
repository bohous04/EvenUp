'use client';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui';

/**
 * The offline queue, made visible.
 *
 * Two states, because they mean different things to a user:
 *
 *  - **Pending** is normal and temporary. The expense is saved and on its way;
 *    a brief appearance is reassurance, not an error.
 *  - **Stuck** is not normal. Something the server will not accept — a deleted
 *    group, a member removed overnight — has used up its retry budget. It is
 *    offered *with its title* and a Try again button, and it is never silently
 *    dropped: an expense the user recorded and watched vanish is the worst
 *    thing this feature could do.
 *
 * A stuck item stays listed rather than being hidden behind a "discarded"
 * count, because the alternative is the user wondering where a real expense
 * went.
 */
export function OfflineQueueBadge({
  pending,
  stuckItems,
  onRetry,
  onDiscard,
}: {
  pending: number;
  /** Queued items that used up their attempt budget. */
  stuckItems: { id: string; title: string }[];
  onRetry: () => void;
  onDiscard: (id: string) => void;
}) {
  const { t } = useI18n();
  if (pending === 0 && stuckItems.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="offline-queue">
      {pending > 0 ? (
        <p
          role="status"
          data-testid="offline-pending"
          className="rounded-xl border border-amber-300 bg-amber-50/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/20 dark:text-amber-200"
        >
          {t('offline.pendingCount', { count: pending })}
        </p>
      ) : null}

      {stuckItems.length > 0 ? (
        <div
          role="alert"
          data-testid="offline-stuck"
          className="rounded-xl border border-red-300 bg-red-50/70 px-3 py-2 dark:border-red-500/40 dark:bg-red-950/20"
        >
          <p className="text-sm font-semibold text-red-800 dark:text-red-200">
            {t('offline.stuck')}
          </p>
          <p className="mt-0.5 text-xs text-red-700 dark:text-red-300">{t('offline.stuckBody')}</p>
          <ul className="mt-2 space-y-1.5">
            {stuckItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 text-sm text-red-900 dark:text-red-100"
              >
                <span className="min-w-0 truncate">{item.title}</span>
                <span className="flex shrink-0 gap-1">
                  <Button variant="secondary" onClick={onRetry} data-testid="offline-retry">
                    {t('offline.retry')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => onDiscard(item.id)}
                    data-testid="offline-discard"
                  >
                    {t('offline.discard')}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
