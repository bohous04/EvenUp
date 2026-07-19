import { Text, View } from 'react-native';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { BottomSheet } from '@/ui';

/** Per-member ledger: spent vs paid vs net balance for one member (PRD §4.6). */
export function MemberBreakdownSheet({
  visible,
  onClose,
  groupId,
  memberId,
  memberName,
  baseCurrency,
}: {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  memberId: string | null;
  memberName: string;
  baseCurrency: string;
}) {
  const { t, formatCurrency } = useI18n();
  const c = useTheme();
  const breakdown = trpc.balance.memberBreakdown.useQuery(
    { groupId, memberId: memberId ?? '' },
    { enabled: !!memberId },
  );

  const row = (label: string, minor: number, strong = false) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: c.textMuted }}>{label}</Text>
      <Text
        style={{
          color: strong && minor !== 0 ? (minor > 0 ? c.green : c.red) : c.text,
          fontWeight: strong ? '700' : '400',
        }}
      >
        {formatCurrency(minor, baseCurrency)}
      </Text>
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title={memberName}>
      {breakdown.data ? (
        <View style={{ gap: 2 }}>
          {row(t('balance.breakdown.spent'), breakdown.data.spentMinorUnits)}
          {row(t('balance.breakdown.paid'), breakdown.data.paidMinorUnits)}
          <View style={{ height: 1, backgroundColor: c.border, marginVertical: 6 }} />
          {row(t('balance.breakdown.balance'), breakdown.data.balanceMinorUnits, true)}
        </View>
      ) : (
        <Text style={{ color: c.textMuted }}>{t('common.loading')}</Text>
      )}
    </BottomSheet>
  );
}
