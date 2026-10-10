'use client';
import { ChevronRight } from './icons';

/*
 * Settings rows (`.app-set-*`, app/app.css). A settings screen is plain
 * sections of full-bleed rows split by hairlines, Mercury/iOS style: every
 * row is one thing, ≥ 56px, with the control under the thumb at its right
 * end. Three kinds:
 *
 *  - SetNavRow   — a tappable row that opens a sheet or runs one action:
 *                  label (and meta) left, value and a chevron right.
 *  - SetSwitch   — the whole row is the label of a switch, so a tap anywhere
 *                  on it toggles; the switch is a real checkbox (role=switch).
 *  - SetField    — a row that holds an inline form (label above, field and
 *                  its button on one line, a hint line below).
 */

export function SetNavRow({
  label,
  meta,
  value,
  tone = 'default',
  chevron = true,
  icon,
  className = '',
  children,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'> & {
  label: React.ReactNode;
  meta?: React.ReactNode;
  value?: React.ReactNode;
  tone?: 'default' | 'danger';
  chevron?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`app-row app-set-row app-set-nav ${tone === 'danger' ? 'app-set-danger' : ''} ${className}`}
      {...props}
    >
      {icon ? (
        <span className="app-set-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="app-set-text">
        <span className="app-set-label">{label}</span>
        {meta ? <span className="app-set-meta">{meta}</span> : null}
      </span>
      {value != null ? <span className="app-set-value">{value}</span> : null}
      {children}
      {chevron ? (
        <ChevronRight size={18} strokeWidth={1.75} className="app-set-chev" aria-hidden />
      ) : null}
    </button>
  );
}

export function SetSwitch({
  label,
  hint,
  status,
  icon,
  checked,
  disabled,
  onChange,
  testId,
}: {
  label: string;
  hint?: React.ReactNode;
  /** Replaces the hint line for a moment (e.g. "Saved") — same line, no shift. */
  status?: React.ReactNode;
  icon?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  testId?: string;
}) {
  return (
    <label className={`app-row app-set-row app-set-nav ${disabled ? 'app-set-busy' : ''}`}>
      {icon ? (
        <span className="app-set-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="app-set-text">
        <span className="app-set-label">{label}</span>
        {hint || status ? (
          <span className="app-set-meta" aria-live="polite">
            {status ?? hint}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="app-switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
      />
    </label>
  );
}

export function SetField({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`app-set-row app-set-field ${className}`} {...props} />;
}
