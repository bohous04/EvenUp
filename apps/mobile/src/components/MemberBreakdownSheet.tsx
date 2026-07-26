import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { AmountText, BottomSheet, SectionLabel } from '@/ui';

type Filter = 'all' | 'paid' | 'share';

/**
 * Per-member ledger explaining one member's balance (PRD §4.6), mirroring web's
 * `member-breakdown-sheet.tsx`: the spent/paid/net tiles, a filter, then the
 * member's own transactions — with itemised rows expandable to per-item shares.
 */
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
  const { t, formatDate } = useI18n();
  const c = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const breakdown = trpc.balance.memberBreakdown.useQuery(
    { groupId, memberId: memberId ?? '' },
    { enabled: !!memberId },
  );

  const data = breakdown.data;
  const entries = (data?.entries ?? []).filter((e) => (filter === 'all' ? true : e.kind === filter));

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t('balance.breakdown.filterAll') },
    { key: 'paid', label: t('balance.breakdown.filterPaid') },
    { key: 'share', label: t('balance.breakdown.filterShare') },
  ];

  /** Web's `Stat` tile: a tinted `rounded-xl` box with a tiny uppercase label. */
  const stat = (label: string, minor: number, colored = false) => (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: c.spacing[1],
        backgroundColor: c.track,
        borderRadius: c.radii.xl,
        paddingVertical: c.spacing[2],
        paddingHorizontal: c.spacing[1],
      }}
    >
      <SectionLabel>{label}</SectionLabel>
      <AmountText
        minorUnits={minor}
        currency={baseCurrency}
        colored={colored}
        style={{ fontWeight: c.type.bodySemibold.fontWeight }}
      />
    </View>
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={memberName}
      closeLabel={t('receipt.close')}
    >
      {!data ? (
        <Text style={{ color: c.textMuted, fontSize: c.type.label.fontSize, textAlign: 'center' }}>
          {t('common.loading')}
        </Text>
      ) : (
        <View style={{ gap: c.spacing[4] }} testID="member-breakdown">
          <View style={{ flexDirection: 'row', gap: c.spacing[2] }}>
            {stat(t('balance.breakdown.spent'), data.spentMinorUnits)}
            {stat(t('balance.breakdown.paid'), data.paidMinorUnits)}
            {stat(t('balance.breakdown.balance'), data.balanceMinorUnits, true)}
          </View>

          {/*
            Solid brand fill when active — these are web's own filter pills, a
            different treatment from the tinted `Chip` used for payer/split
            selection, so they're built here rather than pulled from the kit.
          */}
          <View style={{ flexDirection: 'row', gap: c.spacing[1.5] }} accessibilityRole="radiogroup">
            {filters.map((f) => {
              const active = filter === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  testID={`breakdown-filter-${f.key}`}
                  style={{
                    borderRadius: c.radii.full,
                    paddingHorizontal: c.spacing[3],
                    minHeight: 36,
                    justifyContent: 'center',
                    backgroundColor: active ? c.brand : c.track,
                  }}
                >
                  <Text
                    style={{
                      color: active ? c.onBrand : c.textSecondary,
                      fontSize: c.type.caption.fontSize,
                      fontWeight: '500',
                    }}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {entries.length === 0 ? (
            <Text
              style={{
                color: c.textMuted,
                fontSize: c.type.label.fontSize,
                textAlign: 'center',
                paddingVertical: c.spacing[6],
              }}
            >
              {t('balance.breakdown.empty')}
            </Text>
          ) : (
            <View testID="breakdown-list">
              {entries.map((e, i) => {
                const key = `${e.txId}-${e.kind}`;
                // Only a share of an itemised receipt can be broken down further.
                const canExpand = e.kind === 'share' && e.items != null;
                const isOpen = expanded.has(key);
                return (
                  <View
                    key={key}
                    testID="breakdown-row"
                    style={{
                      paddingVertical: c.spacing[2],
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: c.divider,
                    }}
                  >
                    <Pressable
                      disabled={!canExpand}
                      accessibilityRole="button"
                      accessibilityState={canExpand ? { expanded: isOpen } : undefined}
                      onPress={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                      style={{ flexDirection: 'row', alignItems: 'center', gap: c.spacing[2] }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View
                          style={{ flexDirection: 'row', alignItems: 'center', gap: c.spacing[1] }}
                        >
                          {canExpand ? (
                            <Ionicons
                              name={isOpen ? 'chevron-down' : 'chevron-forward'}
                              size={14}
                              color={c.textMuted}
                            />
                          ) : null}
                          <Text
                            numberOfLines={1}
                            style={{
                              flexShrink: 1,
                              color: c.text,
                              fontSize: c.type.label.fontSize,
                              fontWeight: c.type.label.fontWeight,
                            }}
                          >
                            {e.transferLabel ?? e.title}
                          </Text>
                        </View>
                        <Text style={{ color: c.textMuted, fontSize: c.type.caption.fontSize }}>
                          {(e.type === 'TRANSFER'
                            ? t('balance.breakdown.settlement')
                            : e.kind === 'paid'
                              ? t('balance.breakdown.paidRow')
                              : t('balance.breakdown.shareRow')) + ` · ${formatDate(e.date)}`}
                        </Text>
                      </View>
                      <AmountText
                        minorUnits={e.amountMinorUnits}
                        currency={baseCurrency}
                        colored
                        style={{ fontWeight: c.type.bodySemibold.fontWeight }}
                      />
                    </Pressable>

                    {canExpand && isOpen && e.items ? (
                      <View
                        testID="breakdown-items"
                        style={{ marginLeft: c.spacing[5], marginTop: c.spacing[1], gap: 2 }}
                      >
                        {e.items.map((it, idx) => (
                          <View
                            key={idx}
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              gap: c.spacing[2],
                            }}
                          >
                            <Text
                              numberOfLines={1}
                              style={{
                                flexShrink: 1,
                                color: c.textMuted,
                                fontSize: c.type.caption.fontSize,
                              }}
                            >
                              {it.quantity !== 1 ? `${it.quantity}× ` : ''}
                              {it.name}
                            </Text>
                            <AmountText
                              minorUnits={it.portionMinorUnits}
                              currency={e.currency ?? baseCurrency}
                              style={{ fontSize: c.type.caption.fontSize, color: c.textMuted }}
                            />
                          </View>
                        ))}
                        {e.remainderMinorUnits ? (
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              gap: c.spacing[2],
                            }}
                          >
                            <Text
                              style={{ color: c.textFaint, fontSize: c.type.caption.fontSize }}
                            >
                              {t('balance.breakdown.shared')}
                            </Text>
                            <AmountText
                              minorUnits={e.remainderMinorUnits}
                              currency={e.currency ?? baseCurrency}
                              style={{ fontSize: c.type.caption.fontSize, color: c.textFaint }}
                            />
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </BottomSheet>
  );
}
