import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { describeActivity } from '@evenup/i18n';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';

/**
 * One activity row, normalized across the two endpoints that produce them.
 *
 * `activity.feed` (the cross-group tab) and `activity.list` (one group's sheet)
 * return different shapes, so the currency travels per row rather than per list:
 * the tab mixes groups whose base currencies differ, and a settlement must be
 * formatted in the currency of the group it happened in.
 */
export interface ActivityRow {
  id: string;
  action: string;
  payload: unknown;
  createdAt: Date;
  actorName: string | null;
  baseCurrency: string;
  /** Group name on the cross-group tab; omitted where the group is implied. */
  context?: string;
}

/**
 * Web's `divide-y` list of activity lines, shared by the Activity tab and the
 * group sheet so the two cannot drift in wording or spacing.
 */
export function ActivityRows({ rows }: { rows: readonly ActivityRow[] }) {
  const { t, formatCurrency, formatDate } = useI18n();
  const c = useTheme();

  return (
    <View>
      {rows.map((row, i) => (
        <View
          key={row.id}
          testID="activity-row"
          style={{
            paddingVertical: c.spacing[3],
            gap: c.spacing[0.5],
            // A hairline between rows, none above the first.
            borderTopWidth: i === 0 ? 0 : c.control.hairline,
            borderTopColor: c.divider,
          }}
        >
          <Text style={{ color: c.text, fontSize: c.type.body.fontSize }}>
            {describeActivity(
              row.action,
              row.payload,
              (k, v) => t(k, v),
              (minor) => formatCurrency(minor, row.baseCurrency),
              row.actorName,
            )}
          </Text>
          <Text style={{ color: c.textMuted, fontSize: c.type.meta.fontSize }}>
            {row.context
              ? `${row.context} · ${formatDate(row.createdAt)}`
              : formatDate(row.createdAt)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A filter row scrolls sideways rather than wrapping: the group and member
 * lists are unbounded, and a wrapped row would push the feed itself off-screen.
 */
export function ActivityFilterRow({
  children,
  accessibilityLabel,
  testID,
}: {
  children: ReactNode;
  accessibilityLabel: string;
  testID: string;
}) {
  const c = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      contentContainerStyle={{ flexDirection: 'row', gap: c.spacing[2] }}
    >
      {children}
    </ScrollView>
  );
}
