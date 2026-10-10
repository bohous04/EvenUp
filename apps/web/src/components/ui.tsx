'use client';
import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from './icons';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
};

/*
 * The primary button is ink (near-black in light, near-white in dark), as on
 * the landing — the accent is kept for what the product produces. Every
 * variant is a 44px, 12px-cornered slab (the dock's shape at control size):
 * a thumb-sized target with press feedback that does not depend on hover.
 */
const buttonStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-zinc-900 text-white hover:bg-zinc-700 active:bg-zinc-700 focus-visible:ring-brand-600 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200 dark:active:bg-zinc-200',
  secondary:
    'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-100 active:bg-zinc-100 focus-visible:ring-brand-600 dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:active:bg-zinc-800',
  ghost:
    'text-brand-700 hover:bg-brand-50 active:bg-brand-50 focus-visible:ring-brand-600 dark:text-brand-100 dark:hover:bg-brand-600/15 dark:active:bg-brand-600/15',
  danger:
    'bg-red-700 text-white hover:bg-red-800 active:bg-red-800 focus-visible:ring-red-600 dark:bg-red-500 dark:text-zinc-950 dark:hover:bg-red-400',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2 text-[0.9375rem] font-semibold tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950 ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  );
});

/**
 * Text fields: 44px tall, 8px corners, and 16px type on phones — anything
 * smaller makes iOS Safari zoom the page on focus. Desktop drops to 14px.
 */
export const fieldClass =
  'w-full min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none transition-colors placeholder:text-zinc-500 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:focus:border-brand-500';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} className={`${fieldClass} ${className}`} {...props} />;
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
          className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center px-3 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
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
      <select ref={ref} className={`${fieldClass} ${className}`} {...props}>
        {children}
      </select>
    );
  },
);

/** A raised panel for forms and settings: the section card's box (16px, one hairline). */
export function Card({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-[var(--app-line)] bg-[var(--app-raised)] p-4 sm:p-5 ${className}`}
      {...props}
    />
  );
}

/**
 * Rows split by inset hairlines (after the leading avatar, or at the text
 * with `flush`). Inside a Section the section is the card; on its own a Panel
 * is the same card without a title. `plain` drops the box outside a section.
 * See `.app-section` / `.app-list` in app.css.
 */
export function Panel({
  className = '',
  as: Tag = 'div',
  flush = false,
  plain = false,
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: 'div' | 'ul'; flush?: boolean; plain?: boolean }) {
  return (
    <Tag
      className={`app-list ${plain ? 'app-list-plain' : ''} ${flush ? 'app-list-flush' : ''} ${className}`}
      {...props}
    />
  );
}

/** A tappable list row inside a Panel: ≥ 56px, press-tinted, focus-ringed. */
export const rowClass =
  'app-row flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600';

/**
 * A section of a screen. Two weights, so a screen has one thing that leads:
 *
 *  - `lead` — the raised card (title inside its top edge, rows below). At
 *    most one per screen: the list you act on next (what to pay, who pays
 *    whom). It is the only box on the ground, so it is read first.
 *  - default — a plain section: its title on the ground and its rows full
 *    bleed on the ground, split by hairlines. Lists you read (groups,
 *    balances, transactions) sit a step back from the lead.
 *
 * Sentence case, ink — the landing's label voice. See `.app-section` (app.css).
 */
export function Section({
  title,
  trailing,
  lead = false,
  children,
  className = '',
  ...props
}: Omit<React.HTMLAttributes<HTMLElement>, 'title'> & {
  title: string;
  trailing?: React.ReactNode;
  lead?: boolean;
}) {
  return (
    <section className={`app-section ${lead ? 'app-section-lead' : ''} ${className}`} {...props}>
      <div className="app-section-head">
        <h2 className="app-section-title">{title}</h2>
        {trailing}
      </div>
      {children}
    </section>
  );
}

/** Shared style for round icon-only buttons (rename, modal close, …): a 44px target. */
export const iconButtonClass =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:active:bg-zinc-800';

export function Label({ className = '', ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`mb-1.5 block text-[0.8125rem] font-medium text-zinc-600 dark:text-zinc-300 ${className}`}
      {...props}
    />
  );
}

/** A card's title: the section card's title, for cards that hold a form. */
export function SectionLabel({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`mb-3 text-[0.9375rem] font-semibold tracking-[-0.015em] text-[var(--app-ink)] ${className}`}
      {...props}
    />
  );
}

/**
 * An empty state: a quiet outlined glyph, one line of copy, and the next step
 * when there is one. Left-aligned with the list it stands in for.
 */
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
    <div className="flex flex-col items-start gap-3 px-4 py-6">
      {icon ? (
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          {icon}
        </span>
      ) : null}
      <p className="max-w-[20rem] text-[0.9375rem] leading-snug text-zinc-600 dark:text-zinc-300">
        {title}
      </p>
      {action}
    </div>
  );
}

/**
 * A label painted from CSS (`.app-painted::before`, app/app.css) instead of
 * written as text. For a name the screen already shows as the thing itself —
 * a group's row, a kind you can pick — repeated in a secondary place (the lg
 * rail, a row's context line): the page then holds that name as text once,
 * so "find the group called X" has one answer. Browsers still read it aloud;
 * give the interactive parent an `aria-label` where it is the whole name.
 */
export function Painted({
  text,
  className = '',
  ...props
}: { text: string } & React.HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={`app-painted ${className}`} data-text={text} />;
}
