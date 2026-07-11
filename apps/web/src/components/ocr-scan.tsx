'use client';
import { useRef, useState } from 'react';
import { decimalStringToMinor, minorToDecimalString, splitItemized } from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Input, Select } from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import { MemberChip } from '@/components/member-chip';
import {
  Camera,
  ImageIcon,
  AlertCircle,
  Trash2,
  Plus,
  FileText,
  ChevronUp,
  ChevronDown,
} from '@/components/icons';
import { moveItem } from '@/lib/move-item';

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

/** One picked page (screenshot or PDF) awaiting a `scan.mutate` call. */
type PagePreview = {
  id: string;
  kind: 'image' | 'pdf';
  label: string;
  preview?: string;
  dataUrl: string;
};

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
  onSaved,
}: {
  groupId: string;
  members: MemberLite[];
  baseCurrency: string;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const me = trpc.user.me.useQuery();
  // Receipt OCR needs either VIP access (shared instance key) or the user's own
  // BYO OpenRouter key. Without either, scanning always fails server-side, so we
  // tell them upfront instead of after a doomed attempt. Default to allowed
  // while the profile is still loading to avoid flashing the notice.
  const lacksOcrAccess = me.data ? !me.data.isVip && !me.data.hasOpenRouterKey : false;
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ScanItem[] | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  // Detected shop name — used as the saved expense title so it reads naturally
  // (e.g. "Albert") instead of a hardcoded English "Receipt".
  const [merchant, setMerchant] = useState<string | null>(null);
  const [payerId, setPayerId] = useState(members[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  // Multi-page picker preview (FR-5.4/5.9): screenshots + a PDF collected here,
  // reordered/removed by the user, then sent as `pages[]` to `ocr.scan`.
  const [pages, setPages] = useState<PagePreview[]>([]);
  const MAX_PAGES = 10;

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
      setMerchant(res.result.merchant);
      setPages([]);
      setError(null);
    },
    // Surface the actionable reason rather than a blanket "recognition failed":
    // no VIP access and no BYO OpenRouter key is a config problem the user can
    // fix (PRECONDITION_FAILED), not an unreadable photo.
    onError: (e) =>
      setError(e.data?.code === 'PRECONDITION_FAILED' ? t('ocr.accessRequired') : t('ocr.failed')),
  });

  const createExpense = trpc.transaction.createExpense.useMutation({
    onSuccess: () => {
      setItems(null);
      setReceiptId(null);
      setMerchant(null);
      void utils.transaction.list.invalidate({ groupId });
      void utils.balance.get.invalidate({ groupId });
      void utils.balance.nextPayer.invalidate({ groupId });
      void utils.stats.byCategory.invalidate({ groupId });
      void utils.activity.list.invalidate({ groupId });
      onSaved?.();
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

  /** Downscale and queue one or more picked screenshots as pending pages. */
  async function addImageFiles(files: FileList) {
    const room = MAX_PAGES - pages.length;
    if (room <= 0) {
      setError(t('ocr.tooManyPages'));
      return;
    }
    const picked = Array.from(files).slice(0, room);
    const next: PagePreview[] = [];
    for (const f of picked) {
      const dataUrl = await downscaleImage(f);
      next.push({
        id: crypto.randomUUID(),
        kind: 'image',
        label: f.name,
        preview: dataUrl,
        dataUrl,
      });
    }
    setPages((p) => [...p, ...next]);
    setError(null);
  }

  /** Queue a picked PDF as a pending page (read as a data URL, no downscaling). */
  function addPdf(file: File) {
    if (pages.length >= MAX_PAGES) {
      setError(t('ocr.tooManyPages'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(t('ocr.pdfTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setPages((p) => [...p, { id: crypto.randomUUID(), kind: 'pdf', label: file.name, dataUrl }]);
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  /** Send the queued pages (in their current order) to `ocr.scan`. */
  function scanPages() {
    if (pages.length === 0) return;
    scan.mutate({ groupId, pages: pages.map((p) => p.dataUrl) });
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
      title: merchant?.trim() || t('ocr.receiptTitle'),
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
    <div>
      {/* Camera forces the rear camera; gallery (no `capture`) opens the photo
          library. Two entry points so the user can take a photo now OR pick an
          existing one. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="ocr-camera-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="ocr-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      {/* Multi-page picker: any mix of screenshots and PDF pages, up to MAX_PAGES
          total, queued into `pages` for a single review-then-scan step. */}
      <input
        ref={filesRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid="ocr-files-input"
        onChange={(e) => {
          if (e.target.files?.length) void addImageFiles(e.target.files);
        }}
      />
      <input
        ref={pdfRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        data-testid="ocr-pdf-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) addPdf(f);
        }}
      />

      {!items ? (
        lacksOcrAccess ? (
          <div
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300"
            data-testid="ocr-access-required"
          >
            {t('ocr.accessRequired')}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="secondary"
                onClick={() => cameraRef.current?.click()}
                disabled={scan.isPending}
                className="flex-1"
                data-testid="ocr-upload-btn"
              >
                <Camera size={16} aria-hidden />
                {scan.isPending ? t('ocr.processing') : t('ocr.scan')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => galleryRef.current?.click()}
                disabled={scan.isPending}
                className="flex-1"
                data-testid="ocr-gallery-btn"
              >
                <ImageIcon size={16} aria-hidden />
                {t('ocr.fromGallery')}
              </Button>
            </div>

            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Button
                variant="secondary"
                onClick={() => filesRef.current?.click()}
                disabled={scan.isPending}
                className="flex-1"
                data-testid="ocr-add-files-btn"
              >
                <ImageIcon size={16} aria-hidden /> {t('ocr.addScreenshots')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => pdfRef.current?.click()}
                disabled={scan.isPending}
                className="flex-1"
                data-testid="ocr-add-pdf-btn"
              >
                <FileText size={16} aria-hidden /> {t('ocr.importPdf')}
              </Button>
            </div>

            {pages.length > 0 ? (
              <div className="mt-3 space-y-2" data-testid="ocr-pages">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('ocr.pagesSelected')}</p>
                {pages.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
                    data-testid={`ocr-page-${i}`}
                  >
                    {p.preview ? (
                      <img src={p.preview} alt="" className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <FileText size={20} aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">{p.label}</span>
                    <button
                      type="button"
                      aria-label={t('ocr.moveUp')}
                      disabled={i === 0}
                      className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                      onClick={() => setPages((prev) => moveItem(prev, i, i - 1))}
                    >
                      <ChevronUp size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={t('ocr.moveDown')}
                      disabled={i === pages.length - 1}
                      className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                      onClick={() => setPages((prev) => moveItem(prev, i, i + 1))}
                    >
                      <ChevronDown size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={t('ocr.removePage')}
                      data-testid={`ocr-page-remove-${i}`}
                      className="rounded-md p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                      onClick={() => setPages((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                ))}
                <Button
                  onClick={scanPages}
                  disabled={scan.isPending}
                  data-testid="ocr-scan-pages-btn"
                >
                  {scan.isPending ? t('ocr.processing') : t('ocr.scanPages')}
                </Button>
              </div>
            ) : null}
          </>
        )
      ) : (
        <div className="space-y-3" data-testid="ocr-items">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('ocr.assignItems')}</p>

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
                <div className="flex flex-wrap items-center gap-2">
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

          <div
            className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50"
            data-testid="ocr-per-person"
          >
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
                      size="sm"
                    />
                    {m.displayName}
                  </span>
                  <AmountText
                    minorUnits={perMember.get(m.id) ?? 0}
                    currency={baseCurrency}
                    className={
                      perMember.get(m.id) ? 'font-medium' : 'text-zinc-500 dark:text-zinc-400'
                    }
                    testId={`ocr-person-${m.id}`}
                  />
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
                setMerchant(null);
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200"
        >
          <AlertCircle
            size={16}
            aria-hidden
            className="mt-0.5 shrink-0 text-red-500 dark:text-red-400"
          />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
