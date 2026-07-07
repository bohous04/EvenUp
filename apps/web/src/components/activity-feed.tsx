'use client';
import { useState } from 'react';
import type { MessageKey } from '@evenup/i18n';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Card, Select } from '@/components/ui';
import { describeActivity } from '@/lib/activity-message';

interface MemberLite {
  id: string;
  displayName: string;
}

const ACTION_OPTIONS = [
  'group.created',
  'member.added',
  'member.updated',
  'expense.created',
  'expenses.imported',
  'settlement.recorded',
  'transaction.deleted',
  'group.updated',
  'group.archived',
  'group.restored',
] as const;

export function ActivityFeed({
  groupId,
  members,
  baseCurrency,
}: {
  groupId: string;
  members: MemberLite[];
  baseCurrency: string;
}) {
  const { t, formatCurrency, formatDate } = useI18n();
  const [memberId, setMemberId] = useState('');
  const [action, setAction] = useState('');
  const query = trpc.activity.list.useQuery({
    groupId,
    memberId: memberId || undefined,
    action: action || undefined,
  });

  return (
    <Card>
      <h3 className="mb-3 font-semibold">{t('nav.activity')}</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        <Select
          aria-label={t('group.members')}
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          data-testid="activity-member-filter"
        >
          <option value="">{t('group.members')}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('activity.filterByType')}
          value={action}
          onChange={(e) => setAction(e.target.value)}
          data-testid="activity-action-filter"
        >
          <option value="">{t('common.total')}</option>
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {t(`activityType.${a}` as MessageKey)}
            </option>
          ))}
        </Select>
      </div>
      {query.data && query.data.items.length > 0 ? (
        <ul
          className="divide-y divide-neutral-100 dark:divide-neutral-800"
          data-testid="activity-list"
        >
          {query.data.items.map((it) => (
            <li key={it.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {describeActivity(
                  it.action,
                  it.payload,
                  (k, v) => t(k, v),
                  (minor) => formatCurrency(minor, baseCurrency),
                  it.actorName,
                )}
              </span>
              <span className="text-xs text-neutral-500">{formatDate(it.createdAt)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-sm text-neutral-500">—</p>
      )}
    </Card>
  );
}
