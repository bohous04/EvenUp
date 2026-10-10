'use client';
import { forwardRef } from 'react';
import { Plus } from '@/components/icons';

/**
 * The screen's one primary action (`.app-dock`, app.css "r90"). Phones,
 * signed in: an ink key the tab capsule's height at the right end of the
 * bottom dock — the same place on every screen, under the thumb, never one
 * of the tabs; it carries words ("Add expense") and keeps them as its
 * aria-label when a narrow dock shows only the "+". Signed out: a
 * full-width bar of its own. From `lg` it docks into the left rail under the
 * wordmark. Pass `data-testid`, and `aria-label` when there is no label.
 * (`band` is the r82 in-bar slot, kept for callers that still pass it.)
 */
export const Fab = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    label?: string;
    /** The visible word on phones, where the dock shares a row with the tabs
        ("Výdaj"); `label` stays the accessible name and the wide-screen text. */
    shortLabel?: string;
    band?: boolean;
  }
>(function Fab({ className = '', children, label, shortLabel, band = false, ...props }, ref) {
  return (
    <div className={band ? 'app-dock app-dock-slot' : 'app-dock'}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={`app-fab inline-flex items-center justify-center gap-1.5 whitespace-nowrap px-4 text-[0.9375rem] font-semibold tracking-[-0.01em] ${className}`}
        {...props}
      >
        {children ?? (
          <>
            <span className="app-fab-glyph" aria-hidden>
              <Plus size={18} strokeWidth={2.25} />
            </span>
            {label ? (
              shortLabel ? (
                <>
                  <span className="app-fab-label app-fab-label-long">{label}</span>
                  <span className="app-fab-label app-fab-label-short" aria-hidden>
                    {shortLabel}
                  </span>
                </>
              ) : (
                <span className="app-fab-label">{label}</span>
              )
            ) : null}
          </>
        )}
      </button>
    </div>
  );
});
