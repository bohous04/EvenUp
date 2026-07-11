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
  imageUrl,
}: {
  initials: string;
  color: string;
  name?: string;
  selected?: boolean;
  onClick?: () => void;
  size?: 'xs' | 'sm' | 'md';
  /** Profile picture; when set it replaces the monogram (falls back to it). */
  imageUrl?: string | null;
}) {
  const dims =
    size === 'xs' ? 'h-5 w-5 text-[9px]' : size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm';
  const ring = selected ? 'ring-2 ring-offset-2 ring-zinc-900 dark:ring-white' : '';
  // shrink-0: inside tight flex rows (balances, settle) a long sibling name
  // otherwise squeezes the circle into a pill. overflow-hidden clips the photo
  // to the circle.
  const base = `relative inline-flex ${dims} shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${ring}`;
  const style = { backgroundColor: color, color: readableTextColor(color) };
  // The monogram sits under the photo, so a transparent/late-loading image still
  // shows the initials rather than an empty circle.
  const inner = (
    <>
      {initials}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full rounded-full object-cover"
        />
      ) : null}
    </>
  );

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
        {inner}
      </button>
    );
  }

  return (
    <span className={base} style={style} role="img" aria-label={name ?? initials}>
      {inner}
    </span>
  );
}

/** Overlapping avatar row with a "+N" overflow badge (dashboard group cards). */
export function AvatarStack({
  members,
  max = 5,
}: {
  members: {
    id: string;
    initials: string;
    color: string;
    displayName: string;
    image?: string | null;
  }[];
  max?: number;
}) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((m) => (
        <span
          key={m.id}
          className="-ml-1.5 rounded-full ring-2 ring-white first:ml-0 dark:ring-zinc-900"
        >
          <MemberChip
            initials={m.initials}
            color={m.color}
            name={m.displayName}
            size="sm"
            imageUrl={m.image}
          />
        </span>
      ))}
      {extra > 0 ? (
        <span className="-ml-1.5 first:ml-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500 ring-2 ring-white dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-900">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
