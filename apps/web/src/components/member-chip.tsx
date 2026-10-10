'use client';
import { readableTextColor } from '@evenup/core';

/**
 * A member's avatar (`.app-ava`, app/app.css): the initials on the member's
 * roster colour. Colour is never the only signal (a11y §9.4): the initials and
 * an accessible name always go with it, and the ink is black or white,
 * whichever holds WCAG AA on that colour. A profile photo, when the member has
 * one, covers the initials.
 */
/** "Klára" → "K", "Jan Novák" → "JN"; falls back to the stored initials. */
function monogram(name: string | undefined, initials: string) {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return initials.slice(0, 2);
  const first = words[0]!.slice(0, 1);
  const last = words.length > 1 ? words[words.length - 1]!.slice(0, 1) : '';
  return (first + last).toLocaleUpperCase();
}

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
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Profile picture; when set it replaces the monogram (falls back to it). */
  imageUrl?: string | null;
}) {
  const dims =
    size === 'xs'
      ? 'h-5 w-5 text-[9px]'
      : size === 'sm'
        ? 'h-7 w-7 text-[0.6875rem]'
        : size === 'lg'
          ? 'h-11 w-11 text-base'
          : 'h-9 w-9 text-[0.8125rem]';
  const ring = selected ? 'ring-2 ring-offset-2 ring-zinc-900 dark:ring-white' : '';
  // shrink-0: inside tight flex rows (balances, settle) a long sibling name
  // otherwise squeezes the circle into a pill. overflow-hidden clips the photo
  // to the circle.
  const base = `app-ava relative inline-flex ${dims} shrink-0 items-center justify-center overflow-hidden rounded-full font-[560] leading-none tracking-[-0.03em] ${ring}`;
  const style = { backgroundColor: color, color: readableTextColor(color) };
  const letters = monogram(name, initials);
  // The monogram sits under the picture, so a late-loading photo still shows
  // the initials rather than an empty circle. Fixed box: no shift on load.
  const inner = (
    <>
      {letters}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
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
        // `touch-manipulation` drops the 300 ms tap delay / double-tap-zoom, and
        // press feedback is a transient `active:` scale — a `hover:` scale sticks
        // on touch devices (hover latches until the next tap), leaving an enlarged
        // chip overlapping its neighbours and stealing their tap targets.
        className={`${base} touch-manipulation transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600`}
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
  size = 'sm',
}: {
  members: {
    id: string;
    initials: string;
    color: string;
    displayName: string;
    image?: string | null;
  }[];
  max?: number;
  size?: 'xs' | 'sm';
}) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((m) => (
        <span
          key={m.id}
          className={`${size === 'xs' ? '-ml-1.5' : '-ml-2'} rounded-full ring-2 ring-[var(--app-stack-ring,var(--app-raised))] first:ml-0`}
        >
          <MemberChip
            initials={m.initials}
            color={m.color}
            name={m.displayName}
            size={size}
            imageUrl={m.image}
          />
        </span>
      ))}
      {extra > 0 ? (
        <span
          className={`ml-1 inline-flex ${size === 'xs' ? 'h-5' : 'h-7 min-w-7'} items-center justify-center rounded-full px-1 text-[0.75rem] font-medium tabular-nums text-[var(--app-ink-2)]`}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
