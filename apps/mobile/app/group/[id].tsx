import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { visibleAvatar } from '@evenup/core';
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
import {
  AmountText,
  BottomSheet,
  Fab,
  Button,
  Card,
  EmptyState,
  IconButton,
  Screen,
  SectionLabel,
  Title,
  useTheme,
} from '@/ui';
import type { ThemeTokens } from '@/ui';

type GroupSheet = 'menu' | 'members' | 'invite' | 'settings' | 'categories' | 'csv' | null;

/**
 * Fixed columns in a balance row, mirroring web's `w-28` name cell and
 * `min-w-[7rem]` amount cell: the bar flexes between them so every row's bar
 * shares one left and one right edge. Narrowed from web's 112px because a phone
 * has ~300px of card width to divide.
 */
const NAME_COL = 96;
const AMOUNT_COL = 104;

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = String(id);
  const { t, formatCurrency } = useI18n();
  const c = useTheme();
  const router = useRouter();
  const styles = makeStyles(c);

  const group = trpc.group.get.useQuery({ groupId });
  const balances = trpc.balance.get.useQuery({ groupId });
  // Same query key as `SpendStatsCard` below, so React Query serves both from
  // one fetch; it feeds the total-spent subline under the title (web parity).
  const stats = trpc.stats.byCategory.useQuery({ groupId });

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

  const totalSpent = (stats.data ?? []).reduce((a, s) => a + Math.abs(s.totalMinorUnits), 0);
  const memberBalances = balances.data?.balances ?? [];
  // Bars diverge from the centre, so the widest half-bar is 50% of the track.
  const maxBalance = Math.max(...memberBalances.map((b) => Math.abs(b.balanceMinorUnits)), 1);

  return (
    <>
      <Stack.Screen
        options={{
          title: group.data.name,
          headerRight: () => (
            <IconButton
              icon="ellipsis-horizontal"
              onPress={() => setSheet('menu')}
              accessibilityLabel={t('group.menu')}
              testID="group-menu-btn"
              // The nav bar is `c.card` with a `c.text` tint (see `app/_layout.tsx`),
              // not a brand-blue bar — a white glyph here would be invisible.
              color={c.text}
            />
          ),
        }}
      />

      <Screen scroll fabClearance>
        <View style={{ gap: c.spacing[1] }}>
          <Title numberOfLines={1}>{group.data.name}</Title>
          {totalSpent > 0 ? (
            <Text style={styles.subline}>
              {t('group.spentTotal', { total: formatCurrency(totalSpent, baseCurrency) })}
            </Text>
          ) : null}
        </View>

        <NextRoundCard groupId={groupId} baseCurrency={baseCurrency} />

        {/* Balances: a bar per member diverging from a centre tick — right and
            green when owed, left and red when owing. */}
        <Card>
          <SectionLabel>{t('balance.title')}</SectionLabel>
          <View style={{ gap: c.spacing[2.5] }}>
            {memberBalances.map((b) => {
              const positive = b.balanceMinorUnits > 0;
              const pct = Math.max((Math.abs(b.balanceMinorUnits) / maxBalance) * 50, 2);
              return (
                <Pressable
                  key={b.memberId}
                  onPress={() => setBreakdownMember({ id: b.memberId, name: b.displayName })}
                  accessibilityRole="button"
                  accessibilityLabel={b.displayName}
                  testID="balance-row"
                  style={({ pressed }) => [
                    styles.balanceRow,
                    pressed && { backgroundColor: c.rowPressed },
                  ]}
                >
                  <View style={styles.nameCell}>
                    <MemberChip
                      initials={b.initials}
                      color={b.color}
                      name={b.displayName}
                      imageUrl={b.image}
                      size="sm"
                    />
                    <Text numberOfLines={1} style={styles.nameText}>
                      {b.displayName}
                    </Text>
                  </View>

                  <View style={styles.barTrack}>
                    <View style={styles.barTick} />
                    {b.balanceMinorUnits !== 0 ? (
                      <View
                        style={[
                          styles.barFill,
                          positive
                            ? { left: '50%', backgroundColor: c.barPositive }
                            : { right: '50%', backgroundColor: c.barNegative },
                          { width: `${pct}%` },
                        ]}
                      />
                    ) : null}
                  </View>

                  <AmountText
                    minorUnits={b.balanceMinorUnits}
                    currency={baseCurrency}
                    colored
                    testID={`balance-${b.memberId}`}
                    style={styles.balanceAmount}
                  />
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card>
          <SectionLabel>{t('nav.transactions')}</SectionLabel>
          <TransactionList groupId={groupId} baseCurrency={baseCurrency} />
        </Card>

        {/* Suggested payments: the whole row is the tap target, reading
            `avatar name → avatar name … amount ›`. */}
        <Card>
          <SectionLabel>{t('balance.suggestedPayments')}</SectionLabel>
          {!balances.data || balances.data.payments.length === 0 ? (
            <EmptyState
              title={t('balance.settledUp')}
              icon={<Ionicons name="checkmark-circle-outline" size={28} color={c.textFaint} />}
            />
          ) : (
            // Contiguous rows (web's `ul` has no row gap) — the Card's own gap
            // only separates the label from the list.
            <View>
              {balances.data.payments.map((p, i) => {
                const from = byId.get(p.fromMemberId);
                const to = byId.get(p.toMemberId);
                return (
                  <Pressable
                    key={`${p.fromMemberId}-${i}`}
                    onPress={() =>
                      setSettlePayment({
                        fromMemberId: p.fromMemberId,
                        toMemberId: p.toMemberId,
                        fromName: from?.displayName ?? '',
                        toName: to?.displayName ?? '',
                        amountMinorUnits: p.amountMinorUnits,
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={t('settle.title')}
                    testID="settle-btn"
                    style={({ pressed }) => [
                      styles.settleRow,
                      pressed && { backgroundColor: c.rowPressed },
                    ]}
                  >
                    {from ? (
                      <MemberChip
                        initials={from.initials}
                        color={from.color}
                        name={from.displayName}
                        imageUrl={visibleAvatar(from.user)}
                        size="sm"
                      />
                    ) : null}
                    <Text numberOfLines={1} style={styles.settleName}>
                      {from?.displayName ?? ''}
                    </Text>
                    <Ionicons name="arrow-forward" size={14} color={c.textFaint} />
                    {to ? (
                      <MemberChip
                        initials={to.initials}
                        color={to.color}
                        name={to.displayName}
                        imageUrl={visibleAvatar(to.user)}
                        size="sm"
                      />
                    ) : null}
                    <Text numberOfLines={1} style={styles.settleName}>
                      {to?.displayName ?? ''}
                    </Text>
                    <AmountText
                      minorUnits={p.amountMinorUnits}
                      currency={baseCurrency}
                      style={styles.settleAmount}
                    />
                    <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </Card>

        <SpendStatsCard groupId={groupId} baseCurrency={baseCurrency} />
      </Screen>

      {/*
        One FAB, as on web: it opens the expense form, and "Scan receipt" lives
        as a row *inside* that form. Two stacked buttons in a card at the top
        pushed the balances — the reason you open a group — below the fold.
      */}
      <Fab
        onPress={() => router.push({ pathname: '/expense', params: { groupId } })}
        accessibilityLabel={t('expense.add')}
        testID="add-expense-fab"
      />

      <BottomSheet
        visible={sheet === 'menu'}
        onClose={() => setSheet(null)}
        title={t('group.menu')}
      >
        <Button title={t('group.members')} variant="ghost" onPress={() => setSheet('members')} />
        <Button title={t('invite.create')} variant="ghost" onPress={() => setSheet('invite')} />
        <Button
          title={t('group.categories')}
          variant="ghost"
          onPress={() => setSheet('categories')}
        />
        <Button title={t('csv.import')} variant="ghost" onPress={() => setSheet('csv')} />
        <Button title={t('nav.settings')} variant="ghost" onPress={() => setSheet('settings')} />
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'members'}
        onClose={() => setSheet(null)}
        title={t('group.members')}
      >
        <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: c.spacing[4] }}>
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
    subline: { color: c.textMuted, fontSize: c.type.label.fontSize },

    balanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: c.spacing[2],
      paddingVertical: c.spacing[1],
      paddingHorizontal: c.spacing[1],
      borderRadius: c.radii.lg,
    },
    nameCell: {
      width: NAME_COL,
      flexShrink: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: c.spacing[1.5],
    },
    nameText: { flexShrink: 1, color: c.text, fontSize: c.type.label.fontSize },
    barTrack: {
      flex: 1,
      height: c.spacing[2],
      borderRadius: c.radii.full,
      backgroundColor: c.track,
    },
    barTick: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '50%',
      width: c.control.hairline,
      backgroundColor: c.borderInput,
    },
    barFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: c.radii.full },
    balanceAmount: {
      minWidth: AMOUNT_COL,
      flexShrink: 0,
      textAlign: 'right',
      fontWeight: c.type.bodySemibold.fontWeight,
    },

    settleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: c.spacing[2],
      paddingVertical: c.spacing[2.5],
      paddingHorizontal: c.spacing[2],
      marginHorizontal: -c.spacing[2],
      borderRadius: c.radii.lg,
    },
    settleName: {
      flexShrink: 1,
      color: c.text,
      fontSize: c.type.label.fontSize,
      fontWeight: c.type.bodySemibold.fontWeight,
    },
    settleAmount: {
      marginLeft: 'auto',
      color: c.brandText,
      fontWeight: c.type.bodyBold.fontWeight,
    },
  });
