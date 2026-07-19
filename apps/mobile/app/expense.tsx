import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  EXPENSE_CATEGORIES,
  RECURRENCE_INTERVALS,
  decimalStringToMinor,
  splitEqually,
} from '@evenup/core';
import { useSession } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Card, Chip, Input, AmountInput, Screen, SegmentedControl } from '@/ui';
import { MemberChip } from '@/components/MemberChip';
import { buildSplitPayload, type SplitType } from '@/lib/expense-payload';
import type { MessageKey } from '@evenup/i18n';

const CURRENCIES = ['CZK', 'EUR', 'USD', 'GBP', 'PLN', 'HUF', 'CHF'] as const;
const SPLIT_TYPES: SplitType[] = ['EQUAL', 'EXACT', 'SHARES', 'PERCENTAGE'];
const SPLIT_LABEL: Record<SplitType, MessageKey> = {
  EQUAL: 'split.equal',
  EXACT: 'split.exact',
  SHARES: 'split.shares',
  PERCENTAGE: 'split.percentage',
};
type Recurrence = 'none' | (typeof RECURRENCE_INTERVALS)[number];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Full add-expense form (PRD §4.3/4.4): all split types, single payer, category, date, FX, recurrence. */
export default function ExpenseScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const gid = String(groupId);
  const router = useRouter();
  const { t, formatCurrency } = useI18n();
  const c = useTheme();
  const { data: session } = useSession();
  const utils = trpc.useUtils();

  const group = trpc.group.get.useQuery({ groupId: gid });
  const customCategories = trpc.category.list.useQuery({ groupId: gid });

  const [kind, setKind] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('CZK');
  const [payerId, setPayerId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [splitType, setSplitType] = useState<SplitType>('EQUAL');
  const [exactById, setExactById] = useState<Record<string, string>>({});
  const [weightById, setWeightById] = useState<Record<string, string>>({});
  const [percentById, setPercentById] = useState<Record<string, string>>({});
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [date, setDate] = useState(todayIso());
  const [recurrence, setRecurrence] = useState<Recurrence>('none');
  const [fxRate, setFxRate] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);

  const members = useMemo(
    () => (group.data?.members ?? []).filter((m) => m.isActive),
    [group.data],
  );
  const baseCurrency = group.data?.baseCurrency ?? 'CZK';

  // Default: base currency, everyone selected, payer = the viewer's member.
  useEffect(() => {
    if (!group.data) return;
    setCurrency((prev) => (prev === 'CZK' ? group.data.baseCurrency : prev));
    setSelected((prev) => (prev.size === 0 ? new Set(members.map((m) => m.id)) : prev));
    setPayerId((prev) => {
      if (prev) return prev;
      const mine = members.find((m) => m.userId === session?.user?.id);
      return mine?.id ?? members[0]?.id ?? null;
    });
  }, [group.data, members, session?.user?.id]);

  // Prefill the FX rate from the resolver when the currency differs from base.
  const fx = trpc.fx.resolve.useQuery(
    { base: baseCurrency, quote: currency },
    { enabled: currency !== baseCurrency },
  );
  useEffect(() => {
    if (currency !== baseCurrency && fx.data && fxRate === '') setFxRate(fx.data.rateDecimal);
  }, [currency, baseCurrency, fx.data, fxRate]);

  const setRecurrenceMutation = trpc.transaction.setRecurrence.useMutation();
  const create = trpc.transaction.createExpense.useMutation({
    onSuccess: (created) => {
      if (recurrence !== 'none') {
        setRecurrenceMutation.mutate({ transactionId: created.id, interval: recurrence });
      }
      void utils.balance.get.invalidate({ groupId: gid });
      void utils.transaction.list.invalidate({ groupId: gid });
      router.back();
    },
  });

  if (group.isLoading || !group.data) {
    return (
      <Screen>
        <ActivityIndicator color={c.brand} />
      </Screen>
    );
  }

  const selectedMembers = members.filter((m) => selected.has(m.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Live equal-split preview (cent-accurate via core, respecting default shares).
  let preview: Record<string, number> | null = null;
  if (splitType === 'EQUAL' && selectedMembers.length > 0 && amount) {
    try {
      const shares = splitEqually(
        decimalStringToMinor(amount, currency),
        selectedMembers.map((m) => ({ memberId: m.id, weight: m.defaultShare })),
      );
      preview = Object.fromEntries(shares.map((s) => [s.memberId, s.computedMinorUnits]));
    } catch {
      preview = null;
    }
  }

  function submit() {
    setError(null);
    if (!payerId) {
      setError('split.sumMismatch');
      return;
    }
    const built = buildSplitPayload({
      splitType,
      amount,
      currency,
      selectedIds: selectedMembers.map((m) => m.id),
      exactById,
      weightById,
      percentById,
    });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    create.mutate({
      groupId: gid,
      type: kind,
      title: title.trim() || t('expense.title'),
      note: note.trim() || undefined,
      currency,
      date: new Date(date),
      category,
      payers: [{ memberId: payerId, amountMinorUnits: built.totalMinor }],
      split: built.split,
      exchangeRateToBase: currency !== baseCurrency && fxRate ? fxRate : undefined,
    });
  }

  const perMemberValue = (id: string) =>
    splitType === 'EXACT'
      ? (exactById[id] ?? '')
      : splitType === 'SHARES'
        ? (weightById[id] ?? '')
        : (percentById[id] ?? '');
  const setPerMember = (id: string, v: string) => {
    if (splitType === 'EXACT') setExactById((p) => ({ ...p, [id]: v }));
    else if (splitType === 'SHARES') setWeightById((p) => ({ ...p, [id]: v }));
    else setPercentById((p) => ({ ...p, [id]: v }));
  };

  return (
    <Screen scroll>
      <SegmentedControl
        options={[
          { value: 'EXPENSE', label: t('expense.add') },
          { value: 'INCOME', label: t('expense.income') },
        ]}
        value={kind}
        onChange={(v) => setKind(v as 'EXPENSE' | 'INCOME')}
      />

      <Input label={t('expense.title')} value={title} onChangeText={setTitle} testID="expense-title" />

      {splitType !== 'EXACT' ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <AmountInput
              label={t('expense.amount')}
              value={amount}
              onChangeText={setAmount}
              currency={currency}
              testID="expense-amount"
            />
          </View>
        </View>
      ) : null}

      <Card>
        <Text style={{ color: c.textMuted, fontSize: 13 }}>{t('expense.currency')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CURRENCIES.map((cur) => (
            <Chip key={cur} label={cur} active={cur === currency} onPress={() => setCurrency(cur)} />
          ))}
        </View>
        {currency !== baseCurrency ? (
          <Input
            label={`${t('fx.rate')} → ${baseCurrency}`}
            keyboardType="decimal-pad"
            value={fxRate}
            onChangeText={setFxRate}
          />
        ) : null}
      </Card>

      <Card>
        <Text style={{ color: c.textMuted, fontSize: 13 }}>{t('expense.paidBy')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {members.map((m) => (
            <MemberChip
              key={m.id}
              initials={m.initials}
              color={m.color}
              name={m.displayName}
              selected={payerId === m.id}
              onPress={() => setPayerId(m.id)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{t('expense.splitBetween')}</Text>
          <Text
            style={{ color: c.brand, fontWeight: '600' }}
            onPress={() =>
              setSelected(
                selected.size === members.length ? new Set() : new Set(members.map((m) => m.id)),
              )
            }
          >
            {selected.size === members.length ? t('expense.selectNone') : t('expense.selectAll')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {members.map((m) => (
            <MemberChip
              key={m.id}
              initials={m.initials}
              color={m.color}
              name={m.displayName}
              selected={selected.has(m.id)}
              onPress={() => toggle(m.id)}
            />
          ))}
        </View>

        <SegmentedControl<SplitType>
          options={SPLIT_TYPES.map((s) => ({ value: s, label: t(SPLIT_LABEL[s]) }))}
          value={splitType}
          onChange={setSplitType}
        />

        {splitType !== 'EQUAL'
          ? selectedMembers.map((m) => (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MemberChip initials={m.initials} color={m.color} name={m.displayName} size={28} />
                <View style={{ flex: 1 }}>
                  <Input
                    keyboardType="decimal-pad"
                    value={perMemberValue(m.id)}
                    onChangeText={(v) => setPerMember(m.id, v)}
                    placeholder={splitType === 'PERCENTAGE' ? '%' : undefined}
                  />
                </View>
              </View>
            ))
          : preview
            ? selectedMembers.map((m) => (
                <View
                  key={m.id}
                  style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                >
                  <Text style={{ color: c.textMuted }}>{m.displayName}</Text>
                  <Text style={{ color: c.text }}>
                    {formatCurrency(preview![m.id] ?? 0, currency)}
                  </Text>
                </View>
              ))
            : null}
      </Card>

      <Card>
        <Text style={{ color: c.textMuted, fontSize: 13 }}>{t('expense.category')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {EXPENSE_CATEGORIES.map((cat) => (
            <Chip
              key={cat.key}
              label={t(`category.${cat.key}` as MessageKey)}
              active={category === cat.key}
              onPress={() => setCategory(category === cat.key ? undefined : cat.key)}
            />
          ))}
          {(customCategories.data ?? []).map((cat) => (
            <Chip
              key={cat.id}
              label={cat.name}
              active={category === cat.name}
              onPress={() => setCategory(category === cat.name ? undefined : cat.name)}
            />
          ))}
        </View>
      </Card>

      <Input label={t('expense.date')} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
      <Input label={t('expense.note')} value={note} onChangeText={setNote} multiline />

      <Card>
        <Text style={{ color: c.textMuted, fontSize: 13 }}>{t('expense.recurring')}</Text>
        <SegmentedControl<Recurrence>
          options={[
            { value: 'none', label: t('recurrence.none') },
            ...RECURRENCE_INTERVALS.map((i) => ({
              value: i,
              label: t(`recurrence.${i}` as MessageKey),
            })),
          ]}
          value={recurrence}
          onChange={setRecurrence}
        />
      </Card>

      {error ? (
        <Text style={{ color: c.danger, textAlign: 'center' }} accessibilityRole="alert">
          {t(error)}
        </Text>
      ) : null}

      <Button
        title={t('common.save')}
        onPress={submit}
        loading={create.isPending}
        testID="expense-save"
      />
      <Button title={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
