import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { MemberChip } from '@/components/MemberChip';
import { TransactionList } from '@/components/TransactionList';
import { AddMemberForm } from '@/components/AddMemberForm';
import { MemberList } from '@/components/MemberList';
import { InviteSheet } from '@/components/InviteSheet';
import { GroupSettingsSheet } from '@/components/GroupSettingsSheet';
import { SettleSheet, type PendingPayment } from '@/components/SettleSheet';
import { NextRoundCard } from '@/components/NextRoundCard';
import { MemberBreakdownSheet } from '@/components/MemberBreakdownSheet';
import { SpendStatsCard } from '@/components/SpendStatsCard';
import { CategoryManagerSheet } from '@/components/CategoryManagerSheet';
import { CsvImportSheet } from '@/components/CsvImportSheet';
import { BottomSheet, Button, useTheme } from '@/ui';
import type { ThemeTokens } from '@/ui';

type GroupSheet = 'menu' | 'members' | 'invite' | 'settings' | 'categories' | 'csv' | null;

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = String(id);
  const { t, formatCurrency } = useI18n();
  const c = useTheme();
  const styles = makeStyles(c);

  const group = trpc.group.get.useQuery({ groupId });
  const balances = trpc.balance.get.useQuery({ groupId });

  const [sheet, setSheet] = useState<GroupSheet>(null);
  const [settlePayment, setSettlePayment] = useState<PendingPayment | null>(null);
  const [breakdownMember, setBreakdownMember] = useState<{ id: string; name: string } | null>(null);

  if (group.isLoading || !group.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  const members = group.data.members.filter((m) => m.isActive);
  const baseCurrency = group.data.baseCurrency;
  const byId = new Map(members.map((m) => [m.id, m]));

  return (
    <>
      <Stack.Screen
        options={{
          title: group.data.name,
          headerRight: () => (
            <Pressable
              onPress={() => setSheet('menu')}
              accessibilityRole="button"
              accessibilityLabel={t('group.menu')}
              hitSlop={12}
              style={{ paddingHorizontal: 4 }}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: c.space, gap: 16 }}
      >
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
        <Button title={t('group.members')} variant="secondary" onPress={() => setSheet('members')} />
      </View>

      <View style={styles.card}>
        <Link href={{ pathname: '/expense', params: { groupId } }} asChild>
          <Pressable style={styles.button}>
            <View style={styles.iconBtn}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.buttonText}>{t('expense.add')}</Text>
            </View>
          </Pressable>
        </Link>
        <Link href={{ pathname: '/scan', params: { groupId } }} asChild>
          <Pressable style={[styles.secondaryBtn, styles.iconBtn]}>
            <Ionicons name="camera-outline" size={18} color={c.brand} />
            <Text style={styles.secondaryBtnText}>{t('ocr.scan')}</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>{t('nav.transactions')}</Text>
        <TransactionList groupId={groupId} baseCurrency={baseCurrency} />
      </View>

      <NextRoundCard groupId={groupId} baseCurrency={baseCurrency} />

      <SpendStatsCard groupId={groupId} baseCurrency={baseCurrency} />

      <View style={styles.card}>
        <Text style={styles.h2}>{t('balance.title')}</Text>
        {balances.data?.balances.map((b) => (
          <Pressable
            key={b.memberId}
            style={styles.balanceRow}
            onPress={() => setBreakdownMember({ id: b.memberId, name: b.displayName })}
            accessibilityRole="button"
          >
            <Text style={styles.text}>{b.displayName}</Text>
            <Text
              style={{
                fontWeight: '700',
                color:
                  b.balanceMinorUnits === 0
                    ? c.textMuted
                    : b.balanceMinorUnits > 0
                      ? c.green
                      : c.red,
              }}
            >
              {formatCurrency(b.balanceMinorUnits, baseCurrency)}
            </Text>
          </Pressable>
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
                    setSettlePayment({
                      fromMemberId: p.fromMemberId,
                      toMemberId: p.toMemberId,
                      fromName: from?.displayName ?? '',
                      toName: to?.displayName ?? '',
                      amountMinorUnits: p.amountMinorUnits,
                    })
                  }
                >
                  <Text style={styles.secondaryBtnText}>{t('settle.title')}</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </View>
      </ScrollView>

      <BottomSheet visible={sheet === 'menu'} onClose={() => setSheet(null)} title={t('group.menu')}>
        <Button title={t('group.members')} variant="ghost" onPress={() => setSheet('members')} />
        <Button title={t('invite.create')} variant="ghost" onPress={() => setSheet('invite')} />
        <Button title={t('group.categories')} variant="ghost" onPress={() => setSheet('categories')} />
        <Button title={t('csv.import')} variant="ghost" onPress={() => setSheet('csv')} />
        <Button title={t('nav.settings')} variant="ghost" onPress={() => setSheet('settings')} />
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'members'}
        onClose={() => setSheet(null)}
        title={t('group.members')}
      >
        <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 16 }}>
          <MemberList groupId={groupId} />
          <AddMemberForm groupId={groupId} />
        </ScrollView>
      </BottomSheet>

      <InviteSheet
        visible={sheet === 'invite'}
        onClose={() => setSheet(null)}
        groupId={groupId}
        groupName={group.data.name}
      />

      <GroupSettingsSheet
        visible={sheet === 'settings'}
        onClose={() => setSheet(null)}
        groupId={groupId}
        name={group.data.name}
        simplifyDebts={group.data.simplifyDebts}
        archived={!!group.data.archivedAt}
      />

      <SettleSheet
        visible={!!settlePayment}
        onClose={() => setSettlePayment(null)}
        groupId={groupId}
        currency={baseCurrency}
        payment={settlePayment}
      />

      <MemberBreakdownSheet
        visible={!!breakdownMember}
        onClose={() => setBreakdownMember(null)}
        groupId={groupId}
        memberId={breakdownMember?.id ?? null}
        memberName={breakdownMember?.name ?? ''}
        baseCurrency={baseCurrency}
      />

      <CategoryManagerSheet
        visible={sheet === 'categories'}
        onClose={() => setSheet(null)}
        groupId={groupId}
      />

      <CsvImportSheet
        visible={sheet === 'csv'}
        onClose={() => setSheet(null)}
        groupId={groupId}
        members={members}
      />
    </>
  );
}

const makeStyles = (c: ThemeTokens) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
    h1: { fontSize: 22, fontWeight: '800', color: c.text },
    h2: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 8 },
    text: { color: c.text, flexShrink: 1 },
    muted: { color: c.textMuted },
    card: {
      backgroundColor: c.card,
      borderRadius: c.radius,
      padding: c.space,
      borderWidth: 1,
      borderColor: c.border,
      gap: 10,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    chipItem: { alignItems: 'center', gap: 4 },
    row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    button: { backgroundColor: c.brand, borderRadius: 10, padding: 12, alignItems: 'center' },
    buttonText: { color: '#fff', fontWeight: '700' },
    secondaryBtn: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      alignItems: 'center',
    },
    secondaryBtnText: { color: c.brand, fontWeight: '600' },
    iconBtn: { flexDirection: 'row', gap: 8 },
    balanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
  });
