'use client';
import { useEffect, useId, useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { iconButtonClass } from '@/components/ui';
import { X } from '@/components/icons';

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
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
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
      className="bottom-0 top-auto m-0 w-full max-w-none rounded-t-2xl border border-b-0 border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/40 sm:bottom-0 sm:top-0 sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-lg sm:rounded-2xl sm:border-b dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      {open ? (
        <div
          className="max-h-[92dvh] overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-h-[85vh]"
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
      ) : null}
    </dialog>
  );
}
