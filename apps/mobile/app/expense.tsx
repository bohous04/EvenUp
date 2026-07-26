import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  EXPENSE_CATEGORIES,
  RECURRENCE_INTERVALS,
  decimalStringToMinor,
  minorToDecimalString,
  splitEqually,
} from '@evenup/core';
import { useSession } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import {
  AmountText,
  Button,
  Card,
  Chip,
  DisclosureRow,
  ErrorText,
  HeroAmountInput,
  Input,
  Screen,
  SectionLabel,
  SegmentedControl,
} from '@/ui';
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
  const { groupId, transactionId } = useLocalSearchParams<{
    groupId: string;
    transactionId?: string;
  }>();
  const gid = String(groupId);
  const editingId = transactionId ? String(transactionId) : null;
  const router = useRouter();
  const { t } = useI18n();
  const c = useTheme();
  const { data: session } = useSession();
  const utils = trpc.useUtils();

  const group = trpc.group.get.useQuery({ groupId: gid });
  const customCategories = trpc.category.list.useQuery({ groupId: gid });

  // No longer user-selectable — web's form creates expenses only, so the
  // EXPENSE/INCOME toggle was dropped. The state stays because editing hydrates
  // it from the existing transaction below; without it, opening an income entry
  // and saving would silently convert it to an expense.
  const [kind, setKind] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('CZK');
  const [currencyOpen, setCurrencyOpen] = useState(false);
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
  // Skipped in edit mode — the prefill effect owns the initial state there.
  useEffect(() => {
    if (!group.data || editingId) return;
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

  // Edit mode: load the transaction and prefill the form once.
  const txList = trpc.transaction.list.useQuery({ groupId: gid }, { enabled: !!editingId });
  const editing = editingId ? txList.data?.find((x) => x.id === editingId) : undefined;
  const inited = useRef(false);
  useEffect(() => {
    if (!editing || inited.current) return;
    inited.current = true;
    setKind(editing.type === 'INCOME' ? 'INCOME' : 'EXPENSE');
    setTitle(editing.title);
    setNote(editing.note ?? '');
    setCurrency(editing.currency);
    setDate(new Date(editing.date).toISOString().slice(0, 10));
    setCategory(editing.category ?? undefined);
    setPayerId(editing.payers[0]?.memberId ?? null);
    setSelected(new Set(editing.splits.map((s) => s.memberId)));
    const type = (editing.splitType === 'ITEMIZED' ? 'EQUAL' : editing.splitType) as SplitType;
    setSplitType(type);
    if (type === 'EXACT') {
      setExactById(
        Object.fromEntries(
          editing.splits.map((s) => [
            s.memberId,
            minorToDecimalString(
              Number(s.exactMinorUnits ?? s.computedMinorUnits),
              editing.currency,
            ),
          ]),
        ),
      );
    } else if (type === 'SHARES') {
      setWeightById(
        Object.fromEntries(editing.splits.map((s) => [s.memberId, String(s.shareWeight ?? 1)])),
      );
    } else if (type === 'PERCENTAGE') {
      setPercentById(
        Object.fromEntries(editing.splits.map((s) => [s.memberId, String(s.percentage ?? 0)])),
      );
    } else {
      setAmount(minorToDecimalString(Number(editing.totalMinorUnits), editing.currency));
    }
  }, [editing]);

  const setRecurrenceMutation = trpc.transaction.setRecurrence.useMutation();
  const onSaved = () => {
    void utils.balance.get.invalidate({ groupId: gid });
    void utils.transaction.list.invalidate({ groupId: gid });
    router.back();
  };
  const create = trpc.transaction.createExpense.useMutation({
    onSuccess: (created) => {
      if (recurrence !== 'none') {
        setRecurrenceMutation.mutate({ transactionId: created.id, interval: recurrence });
      }
      onSaved();
    },
  });
  const update = trpc.transaction.updateExpense.useMutation({ onSuccess: onSaved });

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
    const payload = {
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
    };
    if (editingId) update.mutate({ transactionId: editingId, ...payload });
    else create.mutate(payload);
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

  const categoryLabel = !category
    ? undefined
    : EXPENSE_CATEGORIES.some((x) => x.key === category)
      ? t(`category.${category}` as MessageKey)
      : category;

  return (
    <Screen scroll>
      {/*
        Amount first, exactly as on web: the hero figure with the currency
        pinned beside it, then the title on a bare underline. EXACT splits have
        no single total to type — the per-member fields below are the input.
      */}
      {splitType !== 'EXACT' ? (
        <HeroAmountInput
          value={amount}
          onChangeText={setAmount}
          currency={currency}
          testID="expense-amount"
          trailing={
            // Web pins a bordered `select` here — a permanently "selected" Chip
            // would read as a filter that can't be turned off.
            <Pressable
              onPress={() => setCurrencyOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityLabel={t('expense.currency')}
              testID="expense-currency"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: c.spacing[1],
                borderWidth: 1,
                borderColor: c.borderInput,
                borderRadius: c.radii.md,
                backgroundColor: pressed ? c.rowPressed : c.inputBg,
                paddingHorizontal: c.spacing[2],
                minHeight: 36,
                marginBottom: c.spacing[2],
              })}
            >
              <Text
                style={{
                  color: c.text,
                  fontSize: c.type.label.fontSize,
                  fontWeight: c.type.label.fontWeight,
                }}
              >
                {currency}
              </Text>
              <Ionicons
                name={currencyOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={c.textMuted}
              />
            </Pressable>
          }
        />
      ) : null}

      {currencyOpen ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: c.spacing[2],
            justifyContent: 'center',
          }}
        >
          {CURRENCIES.map((cur) => (
            <Chip
              key={cur}
              label={cur}
              active={cur === currency}
              onPress={() => {
                setCurrency(cur);
                setCurrencyOpen(false);
              }}
            />
          ))}
        </View>
      ) : null}

      {currency !== baseCurrency ? (
        <Input
          label={`${t('fx.rate')} → ${baseCurrency}`}
          keyboardType="decimal-pad"
          value={fxRate}
          onChangeText={setFxRate}
        />
      ) : null}

      <Input
        label={t('expense.title')}
        value={title}
        onChangeText={setTitle}
        testID="expense-title"
      />

      <Card>
        <SectionLabel>{t('expense.paidBy')}</SectionLabel>
        <View style={styles.chipWrap}>
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
        <View style={styles.sectionHeader}>
          <SectionLabel>{t('expense.splitBetween')}</SectionLabel>
          <Text
            style={{ color: c.brandText, fontSize: c.type.caption.fontSize, fontWeight: '500' }}
            accessibilityRole="button"
            onPress={() =>
              setSelected(
                selected.size === members.length ? new Set() : new Set(members.map((m) => m.id)),
              )
            }
          >
            {selected.size === members.length ? t('expense.selectNone') : t('expense.selectAll')}
          </Text>
        </View>
        <View style={styles.chipWrap}>
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

        {/* Live per-person share under an equal split — web shows this inline. */}
        {splitType === 'EQUAL' && preview
          ? selectedMembers.map((m) => (
              <View key={m.id} style={styles.previewRow}>
                <Text style={{ color: c.textMuted, fontSize: c.type.meta.fontSize }}>
                  {m.displayName}
                </Text>
                <AmountText minorUnits={preview![m.id] ?? 0} currency={currency} />
              </View>
            ))
          : null}
      </Card>

      {/*
        Web collapses everything below into single-line disclosure rows showing
        the current value, so the form stays short until you need a setting.
      */}
      <Card gap={0}>
        <DisclosureRow label={t('split.type')} value={t(SPLIT_LABEL[splitType])}>
          <SegmentedControl<SplitType>
            options={SPLIT_TYPES.map((s) => ({ value: s, label: t(SPLIT_LABEL[s]) }))}
            value={splitType}
            onChange={setSplitType}
          />
          {splitType !== 'EQUAL'
            ? selectedMembers.map((m) => (
                <View key={m.id} style={styles.memberRow}>
                  <MemberChip
                    initials={m.initials}
                    color={m.color}
                    name={m.displayName}
                    size={28}
                  />
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
            : null}
        </DisclosureRow>

        <DisclosureRow label={t('expense.category')} value={categoryLabel}>
          <View style={styles.chipWrap}>
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
        </DisclosureRow>

        <DisclosureRow label={t('expense.date')} value={date}>
          <Input value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
        </DisclosureRow>

        <DisclosureRow
          label={t('expense.recurring')}
          value={
            recurrence === 'none'
              ? t('recurrence.none')
              : t(`recurrence.${recurrence}` as MessageKey)
          }
        >
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
        </DisclosureRow>

        <DisclosureRow label={t('expense.note')} value={note.trim() || undefined}>
          <Input value={note} onChangeText={setNote} multiline />
        </DisclosureRow>

        {/*
          Receipt scan lives here rather than on the group screen, matching web:
          the same row shape as a DisclosureRow header, but it navigates instead
          of expanding. Scanning is a way to *fill in* an expense, so it belongs
          with the expense.
        */}
        <Pressable
          onPress={() => router.push({ pathname: '/scan', params: { groupId: gid } })}
          accessibilityRole="button"
          testID="expense-receipt-row"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 48,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text
            style={{
              color: c.textSecondary,
              fontSize: c.type.label.fontSize,
              fontWeight: c.type.label.fontWeight,
            }}
          >
            {t('ocr.scan')}
          </Text>
          <Ionicons name="camera-outline" size={18} color={c.brandText} />
        </Pressable>
      </Card>

      {error ? <ErrorText>{t(error)}</ErrorText> : null}

      <Button
        title={t('common.save')}
        onPress={submit}
        loading={create.isPending || update.isPending}
        testID="expense-save"
      />
      <Button title={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
