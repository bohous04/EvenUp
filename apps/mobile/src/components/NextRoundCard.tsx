import { Text, View } from 'react-native';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';

/** "Next one's on…" suggestion — who should cover the group's next expense (PRD §1.2). */
export function NextRoundCard({ groupId, baseCurrency }: { groupId: string; baseCurrency: string }) {
  const { t, formatCurrency } = useI18n();
  const c = useTheme();
  const next = trpc.balance.nextPayer.useQuery({ groupId });

  const data = next.data;
  if (!data || data.state === 'hidden') return null;

  const card = {
    backgroundColor: c.card,
    borderRadius: c.radius,
    borderWidth: 1,
    borderColor: c.border,
    padding: c.space,
    gap: 6,
  } as const;

  if (data.state === 'square') {
    return (
      <View style={card}>
        <Text style={{ color: c.textMuted }}>{t('nextRound.square')}</Text>
      </View>
    );
  }

  const names = data.payers.map((p) => p.displayName).join(', ');
  const behind = Math.abs(data.payers[0]?.balanceMinorUnits ?? 0);
  const reasonKey = data.payers.length > 1 ? 'nextRound.reasonEach' : 'nextRound.reason';

  return (
    <View style={card}>
      <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>
        {t('nextRound.title', { names })}
      </Text>
      <Text style={{ color: c.textMuted, fontSize: 13 }}>
        {t(reasonKey, { amount: formatCurrency(behind, baseCurrency) })}
      </Text>
      {data.runnerUp.length > 0 ? (
        <Text style={{ color: c.textMuted, fontSize: 12 }}>
          {t('nextRound.runnerUp', {
            names: data.runnerUp.map((p) => p.displayName).join(', '),
            amount: formatCurrency(Math.abs(data.runnerUp[0]?.balanceMinorUnits ?? 0), baseCurrency),
          })}
        </Text>
      ) : null}
    </View>
  );
}
