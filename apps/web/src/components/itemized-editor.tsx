'use client';
import { decimalStringToMinor, splitItemized } from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { Button, Input } from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import { MemberChip } from '@/components/member-chip';
import { AlertCircle, Trash2, Plus } from '@/components/icons';

export interface EditorItem {
  name: string;
  /** Price as an editable decimal string in the group's base currency. */
  priceText: string;
  assigned: Set<string>;
  /** Original (pre-translation) receipt wording, shown under the (translated)
   * name as a hint. Only set on the OCR path when a translation was applied. */
  originalName?: string;
}

interface MemberLite {
  id: string;
  displayName: string;
  initials: string;
  color: string;
  imageUrl?: string | null;
}

/** Parse an item's price text to minor units, or null if invalid/non-positive. */
export function itemPriceToMinor(priceText: string, currency: string): number | null {
  try {
    const minor = decimalStringToMinor(priceText.trim() || '0', currency);
    return minor > 0 ? minor : null;
  } catch {
    return null;
  }
}

/**
 * Shared item-review UI: edit/delete/add items, assign each to members by
 * tapping chips, and review the running total and per-person breakdown.
 * Used after receipt OCR (FR-5.4) and reused by the itemized edit form.
 */
export function ItemizedEditor({
  items,
  onChange,
  members,
  baseCurrency,
}: {
  items: EditorItem[];
  onChange: (next: EditorItem[]) => void;
  members: MemberLite[];
  baseCurrency: string;
}) {
  const { t } = useI18n();

  function patchItem(index: number, patch: Partial<EditorItem>) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }
  function toggleAssign(index: number, memberId: string) {
    onChange(
      items.map((it, i) => {
        if (i !== index) return it;
        const assigned = new Set(it.assigned);
        if (assigned.has(memberId)) assigned.delete(memberId);
        else assigned.add(memberId);
        return { ...it, assigned };
      }),
    );
  }
  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }
  function addItem() {
    onChange([...items, { name: '', priceText: '', assigned: new Set<string>() }]);
  }

  const runningTotal = items.reduce(
    (sum, it) => sum + (itemPriceToMinor(it.priceText, baseCurrency) ?? 0),
    0,
  );

  // Live per-person breakdown, computed with the same core logic used on save
  // (each item split evenly among its assignees).
  const perMember = new Map<string, number>();
  const assignedItems = items
    .map((it) => ({
      minor: itemPriceToMinor(it.priceText, baseCurrency),
      memberIds: [...it.assigned],
    }))
    .filter(
      (it): it is { minor: number; memberIds: string[] } =>
        it.minor !== null && it.memberIds.length > 0,
    );
  if (assignedItems.length > 0) {
    try {
      for (const share of splitItemized({
        items: assignedItems.map((it) => ({
          totalMinorUnits: it.minor,
          memberIds: it.memberIds,
        })),
      })) {
        perMember.set(share.memberId, share.computedMinorUnits);
      }
    } catch {
      /* leave the breakdown empty if inputs are momentarily invalid */
    }
  }

  return (
    <>
      {items.map((it, i) => {
        const unassigned = it.assigned.size === 0;
        return (
          <div
            key={i}
            className={`rounded-lg border p-3 transition-colors ${
              unassigned
                ? 'border-amber-300 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-950/20'
                : 'border-zinc-200 dark:border-zinc-800'
            }`}
            data-testid={`ocr-item-${i}`}
          >
            <div className="mb-2 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  value={it.name}
                  onChange={(e) => patchItem(i, { name: e.target.value })}
                  placeholder={t('ocr.itemName')}
                  aria-label={t('ocr.itemName')}
                  data-testid={`ocr-item-name-${i}`}
                />
              </div>
              <div className="w-24 shrink-0">
                <Input
                  value={it.priceText}
                  onChange={(e) => patchItem(i, { priceText: e.target.value })}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label={t('expense.amount')}
                  data-testid={`ocr-item-price-${i}`}
                  className="text-right"
                />
              </div>
              <button
                type="button"
                onClick={() => removeItem(i)}
                aria-label={t('common.delete')}
                data-testid={`ocr-item-remove-${i}`}
                className="rounded-md p-2 text-zinc-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
            {it.originalName ? (
              <p
                className="-mt-1 mb-2 truncate px-1 text-xs text-zinc-400 dark:text-zinc-500"
                title={it.originalName}
                data-testid={`ocr-item-original-${i}`}
              >
                {it.originalName}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {members.map((m) => (
                <MemberChip
                  key={m.id}
                  initials={m.initials}
                  color={m.color}
                  name={m.displayName}
                  imageUrl={m.imageUrl}
                  selected={it.assigned.has(m.id)}
                  onClick={() => toggleAssign(i, m.id)}
                />
              ))}
              {unassigned ? (
                <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <AlertCircle size={13} aria-hidden />
                  {t('ocr.unassigned')}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}

      <Button variant="ghost" onClick={addItem} data-testid="ocr-add-item">
        <Plus size={16} aria-hidden />
        {t('ocr.addItem')}
      </Button>

      <div className="flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <span className="text-sm font-medium">{t('common.total')}</span>
        <AmountText
          minorUnits={runningTotal}
          currency={baseCurrency}
          className="text-base font-semibold"
          testId="ocr-total"
        />
      </div>

      <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50" data-testid="ocr-per-person">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t('ocr.perPerson')}
        </p>
        <ul className="space-y-1.5">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <MemberChip
                  initials={m.initials}
                  color={m.color}
                  name={m.displayName}
                  imageUrl={m.imageUrl}
                  size="sm"
                />
                {m.displayName}
              </span>
              <AmountText
                minorUnits={perMember.get(m.id) ?? 0}
                currency={baseCurrency}
                className={perMember.get(m.id) ? 'font-medium' : 'text-zinc-500 dark:text-zinc-400'}
                testId={`ocr-person-${m.id}`}
              />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
