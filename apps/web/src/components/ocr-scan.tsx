'use client';
import { useRef, useState } from 'react';
import { decimalStringToMinor, minorToDecimalString, splitItemized } from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Card, Input, Select } from '@/components/ui';
import { MemberChip } from '@/components/member-chip';
import { Camera, Trash2, Plus } from '@/components/icons';

interface MemberLite {
  id: string;
  displayName: string;
  initials: string;
  color: string;
}

interface ScanItem {
  name: string;
  /** Price as an editable decimal string in the group's base currency. */
  priceText: string;
  assigned: Set<string>;
}

/**
 * Downscale a (potentially huge phone-camera) image before upload (PRD §6.4):
 * resize the longest edge to `maxDim` and re-encode as JPEG. Receipts read fine
 * at this size and the payload shrinks from tens of MB to well under 1 MB.
 */
function downscaleImage(file: File, maxDim = 1600, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not available'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image'));
    };
    img.src = url;
  });
}

/** Parse an item's price text to minor units, or null if invalid/non-positive. */
function priceToMinor(priceText: string, currency: string): number | null {
  try {
    const minor = decimalStringToMinor(priceText.trim() || '0', currency);
    return minor > 0 ? minor : null;
  } catch {
    return null;
  }
}

/**
 * Receipt OCR: upload → edit/delete/add items, assign each to members by tapping
 * chips, review the running total, then save as an itemized expense (FR-5.4).
 */
export function OcrScan({
  groupId,
  members,
  baseCurrency,
}: {
  groupId: string;
  members: MemberLite[];
  baseCurrency: string;
}) {
  const { t, formatCurrency } = useI18n();
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ScanItem[] | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [payerId, setPayerId] = useState(members[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const scan = trpc.ocr.scan.useMutation({
    onSuccess: (res) => {
      setItems(
        res.result.items.map((it) => ({
          name: it.name,
          priceText: minorToDecimalString(it.totalMinorUnits, baseCurrency),
          assigned: new Set<string>(),
        })),
      );
      setReceiptId(res.receiptId);
      setError(null);
    },
    onError: () => setError(t('ocr.failed')),
  });

  const createExpense = trpc.transaction.createExpense.useMutation({
    onSuccess: () => {
      setItems(null);
      setReceiptId(null);
      void utils.transaction.list.invalidate({ groupId });
      void utils.balance.get.invalidate({ groupId });
      void utils.stats.byCategory.invalidate({ groupId });
      void utils.activity.list.invalidate({ groupId });
    },
    onError: (e) => setError(e.message),
  });

  async function onFile(file: File) {
    setError(null);
    try {
      const dataUrl = await downscaleImage(file);
      scan.mutate({ groupId, imageDataUrl: dataUrl });
    } catch {
      setError(t('ocr.failed'));
    }
  }

  function patchItem(index: number, patch: Partial<ScanItem>) {
    setItems((prev) => prev?.map((it, i) => (i === index ? { ...it, ...patch } : it)) ?? prev);
  }
  function toggleAssign(index: number, memberId: string) {
    setItems(
      (prev) =>
        prev?.map((it, i) => {
          if (i !== index) return it;
          const assigned = new Set(it.assigned);
          if (assigned.has(memberId)) assigned.delete(memberId);
          else assigned.add(memberId);
          return { ...it, assigned };
        }) ?? prev,
    );
  }
  function removeItem(index: number) {
    setItems((prev) => prev?.filter((_, i) => i !== index) ?? prev);
  }
  function addItem() {
    setItems((prev) => [...(prev ?? []), { name: '', priceText: '', assigned: new Set<string>() }]);
  }

  const runningTotal =
    items?.reduce((sum, it) => sum + (priceToMinor(it.priceText, baseCurrency) ?? 0), 0) ?? 0;

  // Live per-person breakdown, computed with the same core logic used on save
  // (each item split evenly among its assignees).
  const perMember = new Map<string, number>();
  if (items) {
    const assignedItems = items
      .map((it) => ({
        minor: priceToMinor(it.priceText, baseCurrency),
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
  }

  function save() {
    if (!items || items.length === 0) {
      setError(t('split.sumMismatch'));
      return;
    }
    const prepared = items.map((it) => ({
      name: it.name.trim() || t('expense.title'),
      minor: priceToMinor(it.priceText, baseCurrency),
      memberIds: [...it.assigned],
    }));
    if (prepared.some((it) => it.minor === null)) {
      setError(t('split.sumMismatch'));
      return;
    }
    if (prepared.some((it) => it.memberIds.length === 0)) {
      setError(t('ocr.assignItems'));
      return;
    }
    const total = prepared.reduce((a, it) => a + (it.minor ?? 0), 0);
    createExpense.mutate({
      groupId,
      title: 'Receipt',
      currency: baseCurrency,
      date: new Date(),
      payers: [{ memberId: payerId, amountMinorUnits: total }],
      receiptId: receiptId ?? undefined,
      split: {
        type: 'ITEMIZED',
        items: prepared.map((it) => ({
          name: it.name,
          totalMinorUnits: it.minor!,
          memberIds: it.memberIds,
        })),
      },
    });
  }

  return (
    <Card>
      <h3 className="mb-3 font-semibold">{t('ocr.scan')}</h3>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="ocr-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />

      {!items ? (
        <Button
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          disabled={scan.isPending}
          data-testid="ocr-upload-btn"
        >
          <Camera size={16} aria-hidden />
          {scan.isPending ? t('ocr.processing') : t('ocr.scan')}
        </Button>
      ) : (
        <div className="space-y-3" data-testid="ocr-items">
          <p className="text-sm text-zinc-500">{t('ocr.assignItems')}</p>

          {items.map((it, i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
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
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <MemberChip
                    key={m.id}
                    initials={m.initials}
                    color={m.color}
                    name={m.displayName}
                    selected={it.assigned.has(m.id)}
                    onClick={() => toggleAssign(i, m.id)}
                  />
                ))}
              </div>
            </div>
          ))}

          <Button variant="ghost" onClick={addItem} data-testid="ocr-add-item">
            <Plus size={16} aria-hidden />
            {t('ocr.addItem')}
          </Button>

          <div className="flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <span className="text-sm font-medium">{t('common.total')}</span>
            <span className="text-base font-semibold" data-testid="ocr-total">
              {formatCurrency(runningTotal, baseCurrency)}
            </span>
          </div>

          <div
            className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50"
            data-testid="ocr-per-person"
          >
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
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
                      size="sm"
                    />
                    {m.displayName}
                  </span>
                  <span
                    className={perMember.get(m.id) ? 'font-medium' : 'text-zinc-400'}
                    data-testid={`ocr-person-${m.id}`}
                  >
                    {formatCurrency(perMember.get(m.id) ?? 0, baseCurrency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Select
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              aria-label={t('expense.paidBy')}
              data-testid="ocr-payer-select"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {t('expense.paidBy')}: {m.displayName}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex gap-2">
            <Button onClick={save} disabled={createExpense.isPending} data-testid="ocr-save-btn">
              {t('common.save')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setItems(null);
                setReceiptId(null);
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
