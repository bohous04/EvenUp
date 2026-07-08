'use client';
import { readableTextColor } from '@evenup/core';

/**
 * Colored member chip. Per a11y §9.4, color is never the only signal — the
 * initials (and an accessible label) always accompany it, and the foreground is
 * computed (black/white) for WCAG-AA contrast on every palette color.
 */
export function MemberChip({
  initials,
  color,
  name,
  selected,
  onClick,
  size = 'md',
}: {
  initials: string;
  color: string;
  name?: string;
  selected?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
}) {
  const dims = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm';
  const ring = selected ? 'ring-2 ring-offset-2 ring-zinc-900 dark:ring-white' : '';
  const base = `inline-flex ${dims} items-center justify-center rounded-full font-semibold ${ring}`;
  const style = { backgroundColor: color, color: readableTextColor(color) };

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        aria-label={name ? `${name}${selected ? ' (selected)' : ''}` : initials}
        title={name}
        className={`${base} transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600`}
        style={style}
      >
        {initials}
      </button>
    );
  }

  return (
    <span className={base} style={style} role="img" aria-label={name ?? initials}>
      {initials}
    </span>
  );
}
