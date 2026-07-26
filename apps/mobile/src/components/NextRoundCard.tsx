import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { AvatarStack } from '@/components/MemberChip';
import { Card, useTheme } from '@/ui';

/** "Next one's on…" suggestion — who should cover the group's next expense (PRD §1.2). */
export function NextRoundCard({
  groupId,
  baseCurrency,
}: {
  groupId: string;
  baseCurrency: string;
}) {
  const { t, formatCurrency } = useI18n();
  const c = useTheme();
  const next = trpc.balance.nextPayer.useQuery({ groupId });

  const data = next.data;
  if (!data || data.state === 'hidden') return null;

  if (data.state === 'square') {
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: c.spacing[2] }}>
          <Ionicons name="cash-outline" size={16} color={c.textMuted} />
          <Text style={{ color: c.textMuted, fontSize: c.type.label.fontSize, flex: 1 }}>
            {t('nextRound.square')}
          </Text>
        </View>
      </Card>
    );
  }

  const names = data.payers.map((p) => p.displayName).join(', ');
  const behind = Math.abs(data.payers[0]?.balanceMinorUnits ?? 0);
  const reasonKey = data.payers.length > 1 ? 'nextRound.reasonEach' : 'nextRound.reason';

  return (
    <Card gap={c.spacing[2]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: c.spacing[3] }}>
        {/* Web shows the tied payers as an overlapping stack, capped at three
            with no overflow badge — hence slicing before `max`. */}
        <AvatarStack
          max={3}
          members={data.payers.slice(0, 3).map((p) => ({
            id: p.memberId,
            initials: p.initials,
            color: p.color,
            displayName: p.displayName,
            imageUrl: p.image,
          }))}
        />

        <View style={{ flex: 1, gap: c.spacing[0.5] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: c.spacing[1.5] }}>
            <Ionicons name="cash-outline" size={16} color={c.text} />
            <Text
              style={{
                flex: 1,
                color: c.text,
                fontSize: c.type.bodySemibold.fontSize,
                fontWeight: c.type.bodySemibold.fontWeight,
              }}
            >
              {t('nextRound.title', { names })}
            </Text>
          </View>
          <Text style={{ color: c.textMuted, fontSize: c.type.label.fontSize }}>
            {t(reasonKey, { amount: formatCurrency(behind, baseCurrency) })}
          </Text>
        </View>
      </View>

      {data.runnerUp.length > 0 ? (
        <Text
          style={{
            color: c.textMuted,
            fontSize: c.type.label.fontSize,
            borderTopWidth: c.control.hairline,
            borderTopColor: c.divider,
            paddingTop: c.spacing[2],
          }}
        >
          {t('nextRound.runnerUp', {
            names: data.runnerUp.map((p) => p.displayName).join(', '),
            amount: formatCurrency(
              Math.abs(data.runnerUp[0]?.balanceMinorUnits ?? 0),
              baseCurrency,
            ),
          })}
        </Text>
      ) : null}
    </Card>
  );
}
