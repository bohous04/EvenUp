'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { iconButtonClass } from '@/components/ui';
import { X } from '@/components/icons';
import { lockBodyScroll } from '@/lib/scroll-lock';

/** Drag the grab handle down at least this far (px) to dismiss the sheet. */
const DRAG_CLOSE_PX = 110;

/**
 * Accessible sheet on the native `<dialog>` element — the same mechanics as
 * Modal (focus trap, top layer, Escape, backdrop-close) but presented as a
 * bottom sheet on phones and a centered card from `sm` up. On phones the grab
 * handle can be dragged down to dismiss.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  // Only treat a click as a backdrop dismissal when the press *started* on the
  // backdrop too — otherwise a text drag that ends on the backdrop would discard
  // the form.
  const pressedOnBackdrop = useRef(false);
  const titleId = useId();
  // Drag-to-dismiss via TOUCH events (they carry implicit capture and fire
  // touchend reliably on iOS, unlike pointer + setPointerCapture). The whole
  // dialog is translated as one unit, so no gap can open between card and body.
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const dragDy = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
    if (!open) el.style.transform = ''; // clear any leftover drag offset
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  function startDrag(clientY: number) {
    // Dismiss any on-screen keyboard first so its show/hide doesn't reflow the
    // sheet mid-drag (that produced a visual gap on the expense form).
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    dragStartY.current = clientY;
    dragDy.current = 0;
    setDragging(true);
  }
  function moveDrag(clientY: number) {
    if (dragStartY.current === null || !ref.current) return;
    const dy = Math.max(0, clientY - dragStartY.current);
    dragDy.current = dy;
    ref.current.style.transform = dy ? `translateY(${dy}px)` : '';
  }
  function endDrag() {
    if (dragStartY.current === null) return;
    const dy = dragDy.current;
    dragStartY.current = null;
    setDragging(false);
    if (ref.current) ref.current.style.transform = ''; // snap back (or close)
    if (dy > DRAG_CLOSE_PX) onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Escape fires `cancel`; keep the close controlled through React state.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Self-heal if the dialog is ever closed by a path we didn't drive, so the
      // trigger can reopen it.
      onClose={() => {
        if (open) onClose();
      }}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (e.target === ref.current && pressedOnBackdrop.current) onClose();
      }}
      // sm+ restores the UA `inset: 0` (top/bottom 0) so `margin: auto` performs
      // real dialog centering — `top/bottom: auto` would drop the dialog at its
      // static (in-flow) position in Firefox, pushing it half off-screen.
      // While dragging we follow the finger with no transition; on release the
      // transition animates the snap-back (or close).
      className={`bottom-0 top-auto m-0 w-full max-w-none rounded-t-2xl border border-b-0 border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/40 sm:bottom-0 sm:top-0 sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-lg sm:rounded-2xl sm:border-b dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100${
        dragging ? '' : ' transition-transform duration-200'
      }`}
    >
      {open ? (
        <div
          // The bottom gutter must clear the mobile browser's bottom toolbar,
          // which `env(safe-area-inset-bottom)` does NOT cover (that's only the
          // home indicator). Without it, a tall form's last rows sit behind the
          // toolbar with nothing to scroll them into view. Desktop (centered
          // card, no chrome) keeps the compact padding.
          className="max-h-[92dvh] overflow-y-auto overscroll-contain p-5 pb-[max(6rem,env(safe-area-inset-bottom))] sm:max-h-[85vh] sm:pb-5"
          data-testid={testId}
        >
          {/* Grab handle — drag down to dismiss (phones only). Touch events +
              `touch-none` own the gesture so nothing scrolls; a generous
              wrapper makes the thin pill easy to grab. */}
          <div
            onTouchStart={(e) => {
              const y = e.touches[0]?.clientY;
              if (y != null) startDrag(y);
            }}
            onTouchMove={(e) => {
              const y = e.touches[0]?.clientY;
              if (y != null) moveDrag(y);
            }}
            onTouchEnd={endDrag}
            onTouchCancel={endDrag}
            className="-mx-5 -mt-5 mb-1 flex touch-none select-none justify-center px-5 pb-2 pt-4 sm:hidden"
            aria-hidden
            data-testid="sheet-drag-handle"
          >
            <div className="h-1 w-9 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          </div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id={titleId} className="text-lg font-bold tracking-tight">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.cancel')}
              title={t('common.cancel')}
              className={iconButtonClass}
              data-testid="sheet-close"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
