'use client';
import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from './icons';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
};

const buttonStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-600',
  secondary:
    'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50 focus-visible:ring-zinc-400 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700',
  ghost:
    'text-brand-600 hover:bg-brand-50 focus-visible:ring-brand-600 dark:text-brand-100 dark:hover:bg-brand-600/10',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 ${className}`}
        {...props}
      />
    );
  },
);

/**
 * A password field with a show/hide toggle. Manages its own `type`
 * (password ↔ text); pass the localized `showLabel`/`hideLabel` for the
 * toggle's accessible name (this primitives module has no i18n of its own).
 */
type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  showLabel?: string;
  hideLabel?: string;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    { className = '', showLabel = 'Show password', hideLabel = 'Hide password', ...props },
    ref,
  ) {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={`pr-10 ${className}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          {visible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        </button>
      </div>
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={`w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 ${className}`}
        {...props}
      >
        {children}
      </select>
    );
  },
);

export function Card({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
      {...props}
    />
  );
}

/** Shared style for compact round icon-only buttons (rename, modal close, …). */
export const iconButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100';

export function Label({ className = '', ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300 ${className}`}
      {...props}
    />
  );
}

/** Small uppercase muted card heading — the redesign's section label. */
export function SectionLabel({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      // zinc-400 on white is only 2.6:1 (fails WCAG AA for this 11px text);
      // zinc-500 clears 4.8:1. Dark mode keeps zinc-400 (6.7:1 on zinc-900).
      className={`mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 ${className}`}
      {...props}
    />
  );
}

/** Friendly centered empty state used inside cards and sheets. */
export function EmptyState({
  icon,
  title,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      {icon ? <span className="text-zinc-300 dark:text-zinc-600">{icon}</span> : null}
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{title}</p>
      {action}
    </div>
  );
}
