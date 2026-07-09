'use client';
import { useEffect, useId, useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { iconButtonClass } from '@/components/ui';
import { X } from '@/components/icons';
import { lockBodyScroll } from '@/lib/scroll-lock';

/**
 * Accessible sheet on the native `<dialog>` element — the same mechanics as
 * Modal (focus trap, top layer, Escape, backdrop-close) but presented as a
 * bottom sheet on phones and a centered card from `sm` up.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /**
   * Optional action bar pinned below the scrollable body (e.g. a Save button).
   * Kept OUT of the scroll area so it never floats over the content, and padded
   * to clear the mobile browser's bottom toolbar. Buttons here live outside any
   * `<form>` in `children`, so associate them with `form="<id>"` to submit.
   */
  footer?: React.ReactNode;
  testId?: string;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  // Only treat a click as a backdrop dismissal when the press *started* on the
  // backdrop too — otherwise a text drag that ends on the backdrop would discard
  // the form.
  const pressedOnBackdrop = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

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
      // The dialog is the flex column that caps the height; the body scrolls and
      // the optional footer stays pinned below it.
      className="bottom-0 top-auto m-0 flex max-h-[92dvh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl border border-b-0 border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/40 sm:bottom-0 sm:top-0 sm:m-auto sm:max-h-[85vh] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:rounded-2xl sm:border-b dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      {open ? (
        <>
          <div
            // Without a footer the body itself must clear the mobile browser's
            // bottom toolbar, which `env(safe-area-inset-bottom)` does NOT cover
            // (that's only the home indicator) — otherwise a tall form's last
            // rows sit behind the toolbar with nothing to scroll them into view.
            // With a footer, the footer carries that clearance instead.
            className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 ${
              footer ? 'pb-4' : 'pb-[max(6rem,env(safe-area-inset-bottom))] sm:pb-5'
            }`}
            data-testid={testId}
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-zinc-200 sm:hidden dark:bg-zinc-700" />
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
          {footer ? (
            // The pinned bar sits at the dialog's bottom edge, which on mobile is
            // behind the browser toolbar — so it carries the same 6rem clearance
            // the body uses. Desktop (centered card, no chrome) keeps it compact.
            <div className="shrink-0 border-t border-zinc-100 bg-white px-5 pb-[max(6rem,env(safe-area-inset-bottom))] pt-3 dark:border-zinc-800 dark:bg-zinc-900 sm:pb-4">
              {footer}
            </div>
          ) : null}
        </>
      ) : null}
    </dialog>
  );
}
