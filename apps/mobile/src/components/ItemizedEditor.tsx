import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { splitItemized } from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { AmountText, Button, Card, IconButton, Input, SectionLabel } from '@/ui';
import { MemberChip } from '@/components/MemberChip';
import { assignAllToItems, itemPriceToMinor, type EditorItem } from '@/lib/itemized';

interface MemberLite {
  id: string;
  displayName: string;
  initials: string;
  color: string;
}

/** Assignment targets are 44pt (web's `size="lg"`) — a 36pt circle made quick
 *  multi-member tagging land on the wrong chip. Read-only avatars stay small. */
const ASSIGN_CHIP = 44;
const READONLY_CHIP = 24;

/**
 * Receipt item review (FR-5.4): edit/add/delete items and assign each to members
 * by tapping colored chips, with a live running total and per-person breakdown.
 * Manual entry is always possible — OCR only seeds the initial rows.
 *
 * Mirrors web's `itemized-editor.tsx`: an "assign to all" header block, one card
 * per item (tinted amber while it still needs a price or an assignee), then the
 * running total and per-person breakdown.
 */
export function ItemizedEditor({
  items,
  onChange,
  members,
  currency,
}: {
  items: EditorItem[];
  onChange: (next: EditorItem[]) => void;
  members: MemberLite[];
  currency: string;
}) {
  const { t } = useI18n();
  const c = useTheme();

  const patch = (i: number, p: Partial<EditorItem>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  const toggle = (i: number, memberId: string) =>
    onChange(
      items.map((it, idx) => {
        if (idx !== i) return it;
        const assigned = new Set(it.assigned);
        if (assigned.has(memberId)) assigned.delete(memberId);
        else assigned.add(memberId);
        return { ...it, assigned };
      }),
    );
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, { name: '', priceText: '', assigned: new Set<string>() }]);

  const priceMinors = items.map((it) => itemPriceToMinor(it.priceText, currency));
  const runningTotal = priceMinors.reduce<number>((s, m) => s + (m ?? 0), 0);

  const perMember = new Map<string, number>();
  const assignedItems = items
    .map((it, i) => ({ minor: priceMinors[i] ?? null, memberIds: [...it.assigned] }))
    .filter(
      (it): it is { minor: number; memberIds: string[] } =>
        it.minor !== null && it.memberIds.length > 0,
    );
  if (assignedItems.length > 0) {
    try {
      for (const s of splitItemized({
        items: assignedItems.map((it) => ({ totalMinorUnits: it.minor, memberIds: it.memberIds })),
      })) {
        perMember.set(s.memberId, s.computedMinorUnits);
      }
    } catch {
      /* momentarily invalid inputs — leave breakdown empty */
    }
  }

  return (
    <View style={{ gap: c.spacing[3] }}>
      {members.length > 0 && items.length > 0 ? (
        <Card>
          <SectionLabel>{t('ocr.assignAll')}</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: c.spacing[3] }}>
            {members.map((m) => (
              <MemberChip
                key={m.id}
                initials={m.initials}
                color={m.color}
                name={m.displayName}
                size={ASSIGN_CHIP}
                selected={items.every((it) => it.assigned.has(m.id))}
                onPress={() => onChange(assignAllToItems(items, m.id))}
              />
            ))}
          </View>
        </Card>
      ) : null}

      {items.map((it, i) => {
        const noPrice = priceMinors[i] === null;
        const incomplete = it.assigned.size === 0 || noPrice;
        return (
          // The testID lives on a wrapper because `Card` takes no testID — the
          // E2E/unit selectors for a row must not move.
          <View key={i} testID={`ocr-item-${i}`}>
            <Card
              style={incomplete ? { backgroundColor: c.amberBg, borderColor: c.amberText } : null}
            >
              <View style={{ flexDirection: 'row', gap: c.spacing[2], alignItems: 'center' }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Input
                    value={it.name}
                    onChangeText={(v) => patch(i, { name: v })}
                    placeholder={t('ocr.itemName')}
                    accessibilityLabel={t('ocr.itemName')}
                    testID={`ocr-item-name-${i}`}
                  />
                </View>
                <View style={{ width: 96 }}>
                  <Input
                    value={it.priceText}
                    onChangeText={(v) => patch(i, { priceText: v })}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    accessibilityLabel={t('expense.amount')}
                    testID={`ocr-item-price-${i}`}
                    style={{ textAlign: 'right' }}
                  />
                </View>
                <IconButton
                  icon="trash-outline"
                  size={20}
                  onPress={() => remove(i)}
                  accessibilityLabel={t('common.delete')}
                  testID={`ocr-item-remove-${i}`}
                />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: c.spacing[3] }}>
                {members.map((m) => (
                  <MemberChip
                    key={m.id}
                    initials={m.initials}
                    color={m.color}
                    name={m.displayName}
                    size={ASSIGN_CHIP}
                    selected={it.assigned.has(m.id)}
                    onPress={() => toggle(i, m.id)}
                  />
                ))}
              </View>
              {incomplete ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: c.spacing[1.5] }}>
                  <Ionicons name="alert-circle-outline" size={14} color={c.amberText} />
                  <Text
                    style={{
                      color: c.amberText,
                      fontSize: c.type.caption.fontSize,
                      fontWeight: '500',
                      flex: 1,
                    }}
                  >
                    {noPrice ? t('ocr.itemNeedsPrice') : t('ocr.unassigned')}
                  </Text>
                </View>
              ) : null}
            </Card>
          </View>
        );
      })}

      <Button
        title={t('ocr.addItem')}
        variant="ghost"
        onPress={add}
        testID="ocr-add-item"
        icon={<Ionicons name="add" size={18} color={c.brandText} />}
      />

      <Card>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={{ color: c.text, ...c.type.bodyMedium }}>{t('common.total')}</Text>
          <AmountText
            minorUnits={runningTotal}
            currency={currency}
            testID="ocr-total"
            style={{ ...c.type.bodySemibold }}
          />
        </View>

        <View
          style={{
            borderTopWidth: c.control.hairline,
            borderTopColor: c.divider,
            paddingTop: c.spacing[3],
            gap: c.spacing[2],
          }}
        >
          <SectionLabel>{t('ocr.perPerson')}</SectionLabel>
          {members.map((m) => {
            const share = perMember.get(m.id);
            return (
              <View
                key={m.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: c.spacing[3],
                }}
              >
                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: c.spacing[2],
                  }}
                >
                  <MemberChip
                    initials={m.initials}
                    color={m.color}
                    name={m.displayName}
                    size={READONLY_CHIP}
                  />
                  <Text
                    numberOfLines={1}
                    style={{ color: c.text, fontSize: c.type.label.fontSize }}
                  >
                    {m.displayName}
                  </Text>
                </View>
                <AmountText
                  minorUnits={share ?? 0}
                  currency={currency}
                  testID={`ocr-person-${m.id}`}
                  style={share ? { color: c.text, fontWeight: '500' } : { color: c.textMuted }}
                />
              </View>
            );
          })}
        </View>
      </Card>
    </View>
  );
}
