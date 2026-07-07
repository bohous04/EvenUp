import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams } from 'expo-router';
import { decimalStringToMinor } from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { MemberChip } from '@/components/MemberChip';
import { theme } from '@/theme';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = String(id);
  const { t, formatCurrency } = useI18n();
  const utils = trpc.useUtils();

  const group = trpc.group.get.useQuery({ groupId });
  const balances = trpc.balance.get.useQuery({ groupId });

  const [memberName, setMemberName] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');

  const addMember = trpc.member.add.useMutation({
    onSuccess: () => {
      setMemberName('');
      void utils.group.get.invalidate({ groupId });
      void utils.balance.get.invalidate({ groupId });
    },
  });
  const addExpense = trpc.transaction.createExpense.useMutation({
    onSuccess: () => {
      setTitle('');
      setAmount('');
      void utils.balance.get.invalidate({ groupId });
    },
  });
  const transfer = trpc.transaction.recordTransfer.useMutation({
    onSuccess: () => void utils.balance.get.invalidate({ groupId }),
  });

  if (group.isLoading || !group.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.brand} />
      </View>
    );
  }

  const members = group.data.members.filter((m) => m.isActive);
  const baseCurrency = group.data.baseCurrency;

  function submitExpense() {
    let totalMinor: number;
    try {
      totalMinor = decimalStringToMinor(amount, baseCurrency);
    } catch {
      return;
    }
    if (!members[0] || totalMinor <= 0) return;
    addExpense.mutate({
      groupId,
      title,
      currency: baseCurrency,
      date: new Date(),
      payers: [{ memberId: members[0].id, amountMinorUnits: totalMinor }],
      split: { type: 'EQUAL', members: members.map((m) => ({ memberId: m.id })) },
    });
  }

  const byId = new Map(members.map((m) => [m.id, m]));

  return (
    <ScrollView contentContainerStyle={{ padding: theme.space, gap: 16 }}>
      <Text style={styles.h1}>{group.data.name}</Text>

      <View style={styles.card}>
        <Text style={styles.h2}>{t('group.members')}</Text>
        <View style={styles.chipRow}>
          {members.map((m) => (
            <View key={m.id} style={styles.chipItem}>
              <MemberChip initials={m.initials} color={m.color} name={m.displayName} size={28} />
              <Text style={styles.muted}>{m.displayName}</Text>
            </View>
          ))}
        </View>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder={t('member.name')}
            value={memberName}
            onChangeText={setMemberName}
          />
          <Pressable
            style={styles.secondaryBtn}
            onPress={() =>
              memberName.trim() && addMember.mutate({ groupId, displayName: memberName.trim() })
            }
          >
            <Text style={styles.secondaryBtnText}>{t('common.add')}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>{t('expense.add')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('expense.title')}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={styles.input}
          placeholder={`0 ${baseCurrency}`}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />
        <Pressable style={styles.button} onPress={submitExpense} disabled={addExpense.isPending}>
          <Text style={styles.buttonText}>{t('common.save')}</Text>
        </Pressable>
        <Link href={{ pathname: '/scan', params: { groupId } }} asChild>
          <Pressable style={[styles.secondaryBtn, styles.iconBtn]}>
            <Ionicons name="camera-outline" size={18} color={theme.brand} />
            <Text style={styles.secondaryBtnText}>{t('ocr.scan')}</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>{t('balance.title')}</Text>
        {balances.data?.balances.map((b) => (
          <View key={b.memberId} style={styles.balanceRow}>
            <Text style={styles.text}>{b.displayName}</Text>
            <Text
              style={{
                fontWeight: '700',
                color:
                  b.balanceMinorUnits === 0
                    ? theme.textMuted
                    : b.balanceMinorUnits > 0
                      ? theme.green
                      : theme.red,
              }}
            >
              {formatCurrency(b.balanceMinorUnits, baseCurrency)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>{t('balance.suggestedPayments')}</Text>
        {!balances.data || balances.data.payments.length === 0 ? (
          <Text style={styles.muted}>{t('balance.settledUp')}</Text>
        ) : (
          balances.data.payments.map((p, i) => {
            const from = byId.get(p.fromMemberId);
            const to = byId.get(p.toMemberId);
            return (
              <View key={`${p.fromMemberId}-${i}`} style={styles.balanceRow}>
                <Text style={styles.text}>
                  {from?.displayName} → {to?.displayName}:{' '}
                  {formatCurrency(p.amountMinorUnits, baseCurrency)}
                </Text>
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() =>
                    transfer.mutate({
                      groupId,
                      fromMemberId: p.fromMemberId,
                      toMemberId: p.toMemberId,
                      amountMinorUnits: p.amountMinorUnits,
                      currency: baseCurrency,
                      method: 'CASH',
                    })
                  }
                >
                  <Text style={styles.secondaryBtnText}>{t('settle.markPaid')}</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 22, fontWeight: '800', color: theme.text },
  h2: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 8 },
  text: { color: theme.text, flexShrink: 1 },
  muted: { color: theme.textMuted },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: theme.space,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 10,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chipItem: { alignItems: 'center', gap: 4 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  button: { backgroundColor: theme.brand, borderRadius: 10, padding: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: theme.brand, fontWeight: '600' },
  iconBtn: { flexDirection: 'row', gap: 8 },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
