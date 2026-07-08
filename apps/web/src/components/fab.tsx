'use client';
import { forwardRef } from 'react';
import { Plus } from '@/components/icons';

/** Fixed bottom-right floating action button. Pass `aria-label` and `data-testid`. */
export const Fab = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function Fab({ className = '', children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={`fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${className}`}
        {...props}
      >
        {children ?? <Plus size={26} aria-hidden />}
      </button>
    );
  },
);
