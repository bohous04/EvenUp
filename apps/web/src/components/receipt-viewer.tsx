'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { ChevronLeft, ChevronRight, X } from '@/components/icons';
import { lockBodyScroll } from '@/lib/scroll-lock';

/** Round, dark-on-dark control button shared by prev/next/close (the lightbox
 * always renders on a black backdrop, independent of the app's light/dark
 * theme, so it needs its own contrast — not `iconButtonClass`). */
const controlButtonClass =
  'inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-30';

/**
 * Full-screen lightbox for paging through a multi-page receipt (FR-5.8/5.9).
 * The parent only mounts this while a viewer should be open (there's no
 * `open` prop) — mounting shows the dialog, unmounting via `onClose` closes
 * it. Mirrors the `<dialog>`-based a11y of Modal/Sheet: focus trap, Escape,
 * top-layer stacking, backdrop dismissal.
 *
 * A PDF page can't render inside an `<img>`, so every page also gets an
 * "open original" link straight to the serve route as a fallback.
 */
export function ReceiptViewer({
  receiptId,
  pageCount,
  onClose,
}: {
  receiptId: string;
  pageCount: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const lastPage = Math.max(pageCount - 1, 0);
  const [page, setPage] = useState(0);

  const clamp = (n: number) => Math.min(Math.max(n, 0), lastPage);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.open) el.showModal();
    return () => {
      if (el.open) el.close();
    };
  }, []);

  useEffect(() => lockBodyScroll(), []);

  const src = `/api/receipts/${receiptId}?page=${page}`;
  const label = t('receipt.pageOf', { n: page + 1, total: pageCount });

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Escape fires `cancel`; keep the close controlled through React state.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Self-heal if the dialog is ever closed by a path we didn't drive.
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-black/95 p-0 backdrop:bg-black/70"
    >
      <div className="flex h-full flex-col text-white">
        <div className="flex items-center justify-between gap-4 p-4">
          <h2 id={titleId} className="truncate text-sm font-semibold">
            {label}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('receipt.close')}
            title={t('receipt.close')}
            className={controlButtonClass}
            data-testid="receipt-close"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div
          className="relative flex flex-1 items-center justify-center overflow-hidden px-4"
          // Dismiss only when the click lands on this stage background itself
          // (not the image, prev/next controls, or anything else nested in it).
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the receipt
              serve route streams private, session-gated bytes; next/image's
              remote-loader model doesn't fit an authenticated same-origin API. */}
          <img
            src={src}
            alt={label}
            data-testid="receipt-viewer-img"
            className="max-h-full max-w-full rounded-lg object-contain"
          />
          <button
            type="button"
            onClick={() => setPage((p) => clamp(p - 1))}
            disabled={page === 0}
            aria-label={t('receipt.prev')}
            title={t('receipt.prev')}
            className={`${controlButtonClass} absolute left-2 top-1/2 -translate-y-1/2`}
            data-testid="receipt-prev"
          >
            <ChevronLeft size={20} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => clamp(p + 1))}
            disabled={page === lastPage}
            aria-label={t('receipt.next')}
            title={t('receipt.next')}
            className={`${controlButtonClass} absolute right-2 top-1/2 -translate-y-1/2`}
            data-testid="receipt-next"
          >
            <ChevronRight size={20} aria-hidden />
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 p-4 text-sm">
          <span data-testid="receipt-counter">{label}</span>
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="text-brand-100 underline hover:text-white"
          >
            {t('receipt.openOriginal')}
          </a>
        </div>
      </div>
    </dialog>
  );
}
