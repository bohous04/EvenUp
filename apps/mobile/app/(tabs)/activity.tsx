import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ACTIVITY_ACTIONS, type MessageKey } from '@evenup/i18n';
import { useSession } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Card, Chip, EmptyState, Screen, Title } from '@/ui';
import { useTheme } from '@/ui/theme';
import { ActivityFilterRow, ActivityRows } from '@/components/ActivityRows';

const PAGE_SIZE = 20;

/**
 * Cross-group activity feed.
 *
 * Web's `ActivityFeed` always has a group in scope, so it filters by *member*
 * and reads `activity.list`. A tab has no group in scope, so this reads
 * `activity.feed` (every group the user can see) and swaps the member filter
 * for a group one — filtering by member across groups is meaningless when the
 * same person is a different member row in each group.
 *
 * Web's two `<select>`s become horizontally scrolling `Chip` rows: a native
 * picker for ~15 options costs a modal round-trip per filter change, and the
 * chip row shows the current selection without a tap.
 */
export default function ActivityScreen() {
  const { t } = useI18n();
  const c = useTheme();
  const { data: session } = useSession();
  const [groupId, setGroupId] = useState<string | undefined>();
  const [action, setAction] = useState<string | undefined>();

  const groups = trpc.group.list.useQuery(undefined, { enabled: !!session?.user });
  const feed = trpc.activity.feed.useInfiniteQuery(
    { groupId, action, limit: PAGE_SIZE },
    {
      enabled: !!session?.user,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    },
  );

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen scroll testID="activity-screen">
      <Title>{t('nav.activity')}</Title>

      <ActivityFilterRow
        accessibilityLabel={t('activity.filterByGroup')}
        testID="activity-group-filter"
      >
        <Chip
          label={t('activity.allGroups')}
          active={!groupId}
          onPress={() => setGroupId(undefined)}
        />
        {(groups.data ?? []).map((g) => (
          <Chip
            key={g.id}
            label={g.name}
            active={groupId === g.id}
            onPress={() => setGroupId(g.id)}
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

      {/* `isLoading`, not `isPending`: a signed-out user's query is disabled and
          stays "pending" forever, which would spin instead of settling. */}
      {feed.isLoading ? (
        <ActivityIndicator color={c.brand} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Ionicons name="pulse-outline" size={28} color={c.textFaint} />}
            title={t('activity.empty')}
          />
        </Card>
      ) : (
        <Card style={{ paddingVertical: c.spacing[1] }}>
          {/* The group name rides along as each row's `context` — web prints only
              the date, because there the group is the page you are already on. */}
          <ActivityRows rows={items.map((it) => ({ ...it, context: it.groupName }))} />
        </Card>
      )}

      {feed.hasNextPage ? (
        <Button
          title={t('activity.loadMore')}
          variant="secondary"
          onPress={() => void feed.fetchNextPage()}
          loading={feed.isFetchingNextPage}
          testID="activity-load-more"
        />
      ) : null}
    </Screen>
  );
}
