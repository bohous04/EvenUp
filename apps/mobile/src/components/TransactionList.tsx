import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';

/** Read-only transaction feed with tap-to-edit and a delete action (FR-3.4). */
export function TransactionList({
  groupId,
  baseCurrency,
}: {
  groupId: string;
  baseCurrency: string;
}) {
  const { t, formatCurrency, formatDate } = useI18n();
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
    return <Text style={{ color: c.textMuted }}>{t('activity.empty')}</Text>;
  }

  return (
    <View style={{ gap: 4 }}>
      {rows.map((tx) => {
        const isTransfer = tx.type === 'TRANSFER';
        return (
          <Pressable
            key={tx.id}
            onPress={() =>
              !isTransfer &&
              router.push({ pathname: '/expense', params: { groupId, transactionId: tx.id } })
            }
            onLongPress={() => confirmDelete(tx.id)}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: c.border,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: '600' }}>
                {isTransfer ? t('expense.transfer') : tx.title}
              </Text>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>{formatDate(new Date(tx.date))}</Text>
            </View>
            <Text
              style={{
                color: tx.type === 'INCOME' ? c.green : c.text,
                fontWeight: '700',
                marginRight: 8,
              }}
            >
              {formatCurrency(Number(tx.totalMinorUnits), tx.currency ?? baseCurrency)}
            </Text>
            <Pressable
              onPress={() => confirmDelete(tx.id)}
              accessibilityRole="button"
              accessibilityLabel={t('expense.delete')}
              hitSlop={10}
            >
              <Ionicons name="trash-outline" size={18} color={c.textMuted} />
            </Pressable>
          </Pressable>
        );
      })}
    </View>
  );
}
