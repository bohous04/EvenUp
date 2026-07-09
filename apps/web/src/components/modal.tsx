'use client';
import { useEffect, useId, useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { iconButtonClass } from '@/components/ui';
import { X } from '@/components/icons';
import { lockBodyScroll } from '@/lib/scroll-lock';

/**
 * Accessible modal built on the native `<dialog>` element — no dependency. Using
 * `showModal()` gives a focus trap, top-layer stacking, a `::backdrop`, Escape
 * handling, and focus-return-to-trigger for free. The dialog element is always
 * present so its ref is stable; the content mounts only while `open` (so the
 * form inside isn't in the DOM when closed).
 */
export function Modal({
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
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      {open ? (
        <div className="max-h-[85vh] overflow-y-auto p-5" data-testid={testId}>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.cancel')}
              title={t('common.cancel')}
              className={iconButtonClass}
              data-testid="modal-close"
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
