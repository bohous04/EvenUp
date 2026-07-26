import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { AmountText, EmptyState, IconButton } from '@/ui';
import { MemberChip } from '@/components/MemberChip';

/** Read-only transaction feed with tap-to-edit and a delete action (FR-3.4). */
export function TransactionList({
  groupId,
  baseCurrency,
}: {
  groupId: string;
  baseCurrency: string;
}) {
  const { t, formatDate } = useI18n();
  const c = useTheme();
  const router = useRouter();
  const utils = trpc.useUtils();
  const list = trpc.transaction.list.useQuery({ groupId });

  const del = trpc.transaction.delete.useMutation({
    onSuccess: () => {
      void utils.transaction.list.invalidate({ groupId });
      void utils.balance.get.invalidate({ groupId });
    },
  });

  function confirmDelete(id: string) {
    Alert.alert(t('expense.delete'), t('expense.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => del.mutate({ transactionId: id }),
      },
    ]);
  }

  const rows = list.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        title={t('activity.empty')}
        icon={<Ionicons name="receipt-outline" size={28} color={c.textFaint} />}
      />
    );
  }

  return (
    <View>
      {rows.map((tx, i) => {
        const isTransfer = tx.type === 'TRANSFER';
        const payer = tx.payers[0]?.member;
        return (
          <Pressable
            key={tx.id}
            onPress={() =>
              !isTransfer &&
              router.push({ pathname: '/expense', params: { groupId, transactionId: tx.id } })
            }
            onLongPress={() => confirmDelete(tx.id)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: c.spacing[3],
              paddingVertical: c.spacing[2],
              paddingHorizontal: c.spacing[1],
              borderRadius: c.radii.lg,
              backgroundColor: pressed ? c.rowPressed : 'transparent',
              borderBottomWidth: i === rows.length - 1 ? 0 : c.control.hairline,
              borderBottomColor: c.divider,
            })}
          >
            {payer ? (
              <MemberChip
                initials={payer.initials}
                color={payer.color}
                name={payer.displayName}
                size="sm"
              />
            ) : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: c.text,
                  fontSize: c.type.bodySemibold.fontSize,
                  fontWeight: c.type.bodySemibold.fontWeight,
                }}
              >
                {isTransfer ? t('expense.transfer') : tx.title}
              </Text>
              <Text
                numberOfLines={1}
                style={{ color: c.textMuted, fontSize: c.type.meta.fontSize }}
              >
                {/* `payer · date`; transfers carry no payer row, so they show
                    the date alone rather than an empty leading separator. */}
                {[payer?.displayName, formatDate(new Date(tx.date))].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <AmountText
              minorUnits={Number(tx.totalMinorUnits)}
              currency={tx.currency ?? baseCurrency}
              style={{
                color: tx.type === 'INCOME' ? c.green : c.text,
                fontWeight: c.type.bodySemibold.fontWeight,
                textAlign: 'right',
              }}
            />
            <IconButton
              icon="trash-outline"
              size={18}
              onPress={() => confirmDelete(tx.id)}
              accessibilityLabel={t('expense.delete')}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
