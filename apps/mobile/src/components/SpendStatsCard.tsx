import { Text, View } from 'react-native';
import { EXPENSE_CATEGORIES } from '@evenup/core';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import type { MessageKey } from '@evenup/i18n';

const BUILTIN = new Set(EXPENSE_CATEGORIES.map((c) => c.key));

/** Simple per-category spend summary (PRD §4.12, FR-12.2). */
export function SpendStatsCard({ groupId, baseCurrency }: { groupId: string; baseCurrency: string }) {
  const { t, formatCurrency } = useI18n();
  const c = useTheme();
  const stats = trpc.stats.byCategory.useQuery({ groupId });

  const rows = (stats.data ?? []).filter((r) => r.totalMinorUnits !== 0);
  if (rows.length === 0) return null;

  const label = (key: string) => (BUILTIN.has(key) ? t(`category.${key}` as MessageKey) : key);

  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: c.radius,
        borderWidth: 1,
        borderColor: c.border,
        padding: c.space,
        gap: 8,
      }}
    >
      <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{t('group.categories')}</Text>
      {rows.map((r) => (
        <View key={r.category} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: c.text }}>{label(r.category)}</Text>
          <Text style={{ color: c.text, fontWeight: '600' }}>
            {formatCurrency(r.totalMinorUnits, baseCurrency)}
          </Text>
        </View>
      ))}
    </View>
  );
}
