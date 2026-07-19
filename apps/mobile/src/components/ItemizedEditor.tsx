import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { splitItemized } from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Input } from '@/ui';
import { MemberChip } from '@/components/MemberChip';
import { assignAllToItems, itemPriceToMinor, type EditorItem } from '@/lib/itemized';

interface MemberLite {
  id: string;
  displayName: string;
  initials: string;
  color: string;
}

/**
 * Receipt item review (FR-5.4): edit/add/delete items and assign each to members
 * by tapping colored chips, with a live running total and per-person breakdown.
 * Manual entry is always possible — OCR only seeds the initial rows.
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
  const { t, formatCurrency } = useI18n();
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
    .filter((it): it is { minor: number; memberIds: string[] } => it.minor !== null && it.memberIds.length > 0);
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
    <View style={{ gap: 12 }}>
      {members.length > 0 && items.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>{t('ocr.assignAll')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {members.map((m) => (
              <MemberChip
                key={m.id}
                initials={m.initials}
                color={m.color}
                name={m.displayName}
                selected={items.every((it) => it.assigned.has(m.id))}
                onPress={() => onChange(assignAllToItems(items, m.id))}
              />
            ))}
          </View>
        </View>
      ) : null}

      {items.map((it, i) => {
        const incomplete = it.assigned.size === 0 || priceMinors[i] === null;
        return (
          <View
            key={i}
            testID={`ocr-item-${i}`}
            style={{
              borderWidth: 1,
              borderColor: incomplete ? '#f59e0b' : c.border,
              borderRadius: c.radius,
              padding: 12,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Input
                  value={it.name}
                  onChangeText={(v) => patch(i, { name: v })}
                  placeholder={t('ocr.itemName')}
                  testID={`ocr-item-name-${i}`}
                />
              </View>
              <View style={{ width: 90 }}>
                <Input
                  value={it.priceText}
                  onChangeText={(v) => patch(i, { priceText: v })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  testID={`ocr-item-price-${i}`}
                />
              </View>
              <Pressable
                onPress={() => remove(i)}
                accessibilityLabel={t('common.delete')}
                testID={`ocr-item-remove-${i}`}
                hitSlop={8}
                style={{ padding: 8 }}
              >
                <Ionicons name="trash-outline" size={18} color={c.textMuted} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {members.map((m) => (
                <MemberChip
                  key={m.id}
                  initials={m.initials}
                  color={m.color}
                  name={m.displayName}
                  selected={it.assigned.has(m.id)}
                  onPress={() => toggle(i, m.id)}
                />
              ))}
            </View>
            {incomplete ? (
              <Text style={{ color: '#b45309', fontSize: 12 }}>
                {priceMinors[i] === null ? t('ocr.itemNeedsPrice') : t('ocr.unassigned')}
              </Text>
            ) : null}
          </View>
        );
      })}

      <Button title={t('ocr.addItem')} variant="ghost" onPress={add} testID="ocr-add-item" />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 }}>
        <Text style={{ color: c.text, fontWeight: '600' }}>{t('common.total')}</Text>
        <Text style={{ color: c.text, fontWeight: '700' }} testID="ocr-total">
          {formatCurrency(runningTotal, currency)}
        </Text>
      </View>

      <View style={{ backgroundColor: c.bg, borderRadius: c.radius, padding: 12, gap: 6 }}>
        <Text style={{ color: c.textMuted, fontSize: 12 }}>{t('ocr.perPerson')}</Text>
        {members.map((m) => (
          <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text }}>{m.displayName}</Text>
            <Text style={{ color: perMember.get(m.id) ? c.text : c.textMuted }}>
              {formatCurrency(perMember.get(m.id) ?? 0, currency)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
