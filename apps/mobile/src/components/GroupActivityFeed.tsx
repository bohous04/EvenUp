import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ACTIVITY_ACTIONS, type MessageKey } from '@evenup/i18n';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Chip, EmptyState } from '@/ui';
import { useTheme } from '@/ui/theme';
import { ActivityFilterRow, ActivityRows } from '@/components/ActivityRows';

interface MemberLite {
  id: string;
  displayName: string;
}

/**
 * One group's activity, mirroring web's `ActivityFeed` — including its *member*
 * filter, which only makes sense with a group in scope (the Activity tab swaps
 * it for a group filter, since one person is a different member row in each
 * group).
 *
 * Reads `activity.list` rather than `feed` for that reason: `list` is the
 * endpoint that carries the member filter.
 */
export function GroupActivityFeed({
  groupId,
  members,
  baseCurrency,
}: {
  groupId: string;
  members: readonly MemberLite[];
  baseCurrency: string;
}) {
  const { t } = useI18n();
  const c = useTheme();
  const [memberId, setMemberId] = useState<string | undefined>();
  const [action, setAction] = useState<string | undefined>();

  const query = trpc.activity.list.useQuery({ groupId, memberId, action });
  const rows = (query.data?.items ?? []).map((it) => ({ ...it, baseCurrency }));

  return (
    <View style={{ gap: c.spacing[3] }}>
      <ActivityFilterRow accessibilityLabel={t('group.members')} testID="activity-member-filter">
        <Chip
          label={t('common.showAll')}
          active={!memberId}
          onPress={() => setMemberId(undefined)}
        />
        {members.map((m) => (
          <Chip
            key={m.id}
            label={m.displayName}
            active={memberId === m.id}
            onPress={() => setMemberId(m.id)}
          />
        ))}
      </ActivityFilterRow>

      <ActivityFilterRow
        accessibilityLabel={t('activity.filterByType')}
        testID="activity-action-filter"
      >
        <Chip
          label={t('activity.allTypes')}
          active={!action}
          onPress={() => setAction(undefined)}
        />
        {ACTIVITY_ACTIONS.map((a) => (
          <Chip
            key={a}
            label={t(`activityType.${a}` as MessageKey)}
            active={action === a}
            onPress={() => setAction(a)}
          />
        ))}
      </ActivityFilterRow>

      {query.isLoading ? (
        <ActivityIndicator color={c.brand} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('activity.empty')} />
      ) : (
        <ActivityRows rows={rows} />
      )}
    </View>
  );
}
