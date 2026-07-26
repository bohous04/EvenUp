import { Text, View } from 'react-native';
import { EXPENSE_CATEGORIES } from '@evenup/core';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { AmountText, Card, SectionLabel, useTheme } from '@/ui';
import type { MessageKey } from '@evenup/i18n';

const BUILTIN = new Set(EXPENSE_CATEGORIES.map((c) => c.key));

/** Simple per-category spend summary (PRD §4.12, FR-12.2). */
export function SpendStatsCard({
  groupId,
  baseCurrency,
}: {
  groupId: string;
  baseCurrency: string;
}) {
  const { t } = useI18n();
  const c = useTheme();
  const stats = trpc.stats.byCategory.useQuery({ groupId });

  const rows = (stats.data ?? []).filter((r) => r.totalMinorUnits !== 0);
  if (rows.length === 0) return null;

  const label = (key: string) => (BUILTIN.has(key) ? t(`category.${key}` as MessageKey) : key);
  // The bar is scaled to the biggest bucket; the percentage is a share of the
  // whole, exactly as on web (`apps/web/src/components/spend-stats.tsx`).
  const max = Math.max(...rows.map((r) => Math.abs(r.totalMinorUnits)), 1);
  const grandTotal = rows.reduce((a, r) => a + Math.abs(r.totalMinorUnits), 0) || 1;

  return (
    <Card>
      <SectionLabel>{t('group.categories')}</SectionLabel>
      <View style={{ gap: c.spacing[3] }}>
        {rows.map((r) => {
          const share = Math.round((Math.abs(r.totalMinorUnits) / grandTotal) * 100);
          const fill = Math.max(2, (Math.abs(r.totalMinorUnits) / max) * 100);
          return (
            <View key={r.category} style={{ gap: c.spacing[1] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: c.spacing[2] }}>
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, color: c.text, fontSize: c.type.label.fontSize }}
                >
                  {label(r.category)}
                </Text>
                <Text
                  style={{
                    color: c.textFaint,
                    fontSize: c.type.caption.fontSize,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {`${share}%`}
                </Text>
                <AmountText
                  minorUnits={r.totalMinorUnits}
                  currency={baseCurrency}
                  style={{ fontWeight: c.type.bodyMedium.fontWeight }}
                />
              </View>
              <View
                style={{
                  height: c.spacing[3],
                  borderRadius: c.radii.full,
                  backgroundColor: c.track,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: '100%',
                    width: `${fill}%`,
                    borderRadius: c.radii.full,
                    backgroundColor: c.brand500,
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
