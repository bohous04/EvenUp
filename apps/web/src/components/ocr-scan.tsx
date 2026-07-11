'use client';
import { useRef, useState } from 'react';
import { minorToDecimalString } from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Select } from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import {
  Camera,
  ImageIcon,
  AlertCircle,
  Trash2,
  FileText,
  ChevronUp,
  ChevronDown,
} from '@/components/icons';
import { moveItem } from '@/lib/move-item';
import { parseLocalDate } from '@/lib/local-date';
import { expandItemQuantities } from '@/lib/expand-items';
import { type EditorItem, ItemizedEditor, itemPriceToMinor } from '@/components/itemized-editor';

interface MemberLite {
  id: string;
  displayName: string;
  initials: string;
  color: string;
  imageUrl?: string | null;
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
  const { t, locale } = useI18n();
  const utils = trpc.useUtils();
  const me = trpc.user.me.useQuery();
  // Receipt OCR needs either VIP access (shared instance key) or the user's own
  // BYO OpenRouter key. Without either, scanning always fails server-side, so we
  // tell them upfront instead of after a doomed attempt. Default to allowed
  // while the profile is still loading to avoid flashing the notice.
  const lacksOcrAccess = me.data ? !me.data.isVip && !me.data.hasOpenRouterKey : false;
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<EditorItem[] | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  // Detected shop name — used as the saved expense title so it reads naturally
  // (e.g. "Albert") instead of a hardcoded English "Receipt".
  const [merchant, setMerchant] = useState<string | null>(null);
  // Detected purchase date + printed grand total + category, carried from OCR
  // onto the saved expense so the user doesn't re-key what the receipt shows.
  const [receiptDate, setReceiptDate] = useState<string | null>(null);
  const [receiptTotalMinor, setReceiptTotalMinor] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  // When the extracted items don't sum to the receipt's printed total, offer to
  // add a proportional balancing line so the expense total matches the receipt.
  // Defaults on only when OCR itself couldn't reconcile — a user who then edits
  // prices is overriding, so their item sum wins unless they opt back in.
  const [reconcile, setReconcile] = useState(false);
  const [payerId, setPayerId] = useState(members[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  // Multi-page picker preview (FR-5.4/5.9): screenshots + a PDF collected here,
  // reordered/removed by the user, then sent as `pages[]` to `ocr.scan`.
  const [pages, setPages] = useState<PagePreview[]>([]);
  const MAX_PAGES = 10;

  /** Clear the review state back to the pre-scan screen (after save or cancel). */
  function resetScan() {
    setItems(null);
    setReceiptId(null);
    setMerchant(null);
    setReceiptDate(null);
    setReceiptTotalMinor(null);
    setCategory(null);
    setReconcile(false);
  }

  const scan = trpc.ocr.scan.useMutation({
    onSuccess: (res) => {
      // Prefer the model's readable name (e.g. "Pepsi XXL Oreo 45g") over the
      // receipt's cryptic printed abbreviation (e.g. "Nafe LPPXXL0reo45g"); the
      // raw wording is unhelpful, so we don't surface it. Then expand a line's
      // whole quantity into that many rows (e.g. "3× Čokoláda") so each unit can
      // be assigned to a different person in the split below.
      const resolved = res.result.items.map((it) => ({
        name: it.nameTranslated?.trim() || it.name,
        quantity: it.quantity,
        totalMinorUnits: it.totalMinorUnits,
      }));
      setItems(
        expandItemQuantities(resolved).map((it) => ({
          name: it.name,
          priceText: minorToDecimalString(it.totalMinorUnits, baseCurrency),
          assigned: new Set<string>(),
        })),
      );
      setReceiptId(res.receiptId);
      setMerchant(res.result.merchant);
      setReceiptDate(res.result.date);
      setReceiptTotalMinor(res.result.totalMinorUnits > 0 ? res.result.totalMinorUnits : null);
      setCategory(res.result.category);
      setReconcile(!res.result.reconciliation.matchesTotal);
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
      resetScan();
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
      scan.mutate({ groupId, imageDataUrl: dataUrl, lang: locale });
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
    scan.mutate({ groupId, pages: pages.map((p) => p.dataUrl), lang: locale });
  }

  function save() {
    if (!items || items.length === 0) {
      setError(t('split.sumMismatch'));
      return;
    }
    const prepared = items.map((it) => ({
      name: it.name.trim() || t('expense.title'),
      minor: itemPriceToMinor(it.priceText, baseCurrency),
      memberIds: [...it.assigned],
    }));
    if (prepared.some((it) => it.minor === null)) {
      setError(t('ocr.itemNeedsPrice'));
      return;
    }
    if (prepared.some((it) => it.memberIds.length === 0)) {
      setError(t('ocr.assignItems'));
      return;
    }
    const itemsTotal = prepared.reduce((a, it) => a + (it.minor ?? 0), 0);
    // Reconcile to the receipt's printed total (when asked) by adding a single
    // proportional balancing line for the difference — deposits, rounding, or an
    // un-itemized discount the model couldn't attribute. A negative difference
    // (items over-count) is handled by core's abs-weighted allocation.
    const diff = reconcile && receiptTotalMinor != null ? receiptTotalMinor - itemsTotal : 0;
    const total = itemsTotal + diff;
    // Prefer the receipt's own date (parsed as local noon so it can't shift a
    // day across timezones); fall back to now for a missing/malformed one.
    const date = receiptDate ? parseLocalDate(receiptDate) : new Date();
    createExpense.mutate({
      groupId,
      title: merchant?.trim() || t('ocr.receiptTitle'),
      currency: baseCurrency,
      date,
      category: category ?? undefined,
      payers: [{ memberId: payerId, amountMinorUnits: total }],
      receiptId: receiptId ?? undefined,
      split: {
        type: 'ITEMIZED',
        items: prepared.map((it) => ({
          name: it.name,
          totalMinorUnits: it.minor!,
          memberIds: it.memberIds,
        })),
        ...(diff !== 0
          ? {
              extraCharges: [
                {
                  label: t('ocr.reconcileItem'),
                  amountMinorUnits: diff,
                  allocation: { kind: 'proportional' as const },
                },
              ],
            }
          : {}),
      },
    });
  }

  // Live discrepancy between the edited item rows and the receipt's printed
  // total; drives the reconcile banner shown above the payer picker. Only summed
  // when a receipt total exists — otherwise there's no discrepancy to show.
  const itemsSumMinor =
    receiptTotalMinor != null
      ? (items ?? []).reduce((a, it) => a + (itemPriceToMinor(it.priceText, baseCurrency) ?? 0), 0)
      : 0;
  const totalDiffMinor = receiptTotalMinor != null ? receiptTotalMinor - itemsSumMinor : 0;
  const showReconcile = receiptTotalMinor != null && totalDiffMinor !== 0;

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
      {/* Gallery picker: 1 or more screenshots, queued into `pages` for a single
          review-then-scan step (reorder/remove before scanning). Combined with any
          PDF pages, up to MAX_PAGES total. */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid="ocr-file-input"
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

          <ItemizedEditor
            items={items}
            onChange={setItems}
            members={members}
            baseCurrency={baseCurrency}
          />

          {showReconcile ? (
            <div
              className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-500/40 dark:bg-amber-950/20"
              data-testid="ocr-total-mismatch"
            >
              <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-200">
                <AlertCircle size={14} aria-hidden />
                {t('ocr.totalMismatch')}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-amber-700 dark:text-amber-300">
                <span>
                  {t('ocr.receiptTotal')}:{' '}
                  <AmountText
                    minorUnits={receiptTotalMinor!}
                    currency={baseCurrency}
                    className="font-semibold"
                  />
                </span>
                <span>
                  {t('common.total')}:{' '}
                  <AmountText
                    minorUnits={itemsSumMinor}
                    currency={baseCurrency}
                    className="font-semibold"
                  />
                </span>
                <span>
                  {t('ocr.difference')}:{' '}
                  <AmountText
                    minorUnits={totalDiffMinor}
                    currency={baseCurrency}
                    className="font-semibold"
                  />
                </span>
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
                <input
                  type="checkbox"
                  checked={reconcile}
                  onChange={(e) => setReconcile(e.target.checked)}
                  data-testid="ocr-reconcile-toggle"
                  className="h-4 w-4 rounded border-amber-400 text-brand-600 focus-visible:ring-brand-600"
                />
                {t('ocr.reconcile')}
              </label>
            </div>
          ) : null}

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
            <Button variant="ghost" onClick={resetScan}>
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
