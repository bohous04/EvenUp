'use client';
import { MEMBER_COLORS } from '@evenup/core';

/**
 * A member's avatar (`.app-ava`, app/app.css): a pale wash of the member's
 * roster colour with the initial in a deep shade of it, so people are told
 * apart at a glance while the colour stays quiet next to the money. A profile
 * photo, when the member has one, replaces the initial.
 */
/*
 * The landing's illustrated people (public/marketing/avatars, the same files
 * the marketing page draws its groups with), so a member without a photo gets
 * a face, not a pastel letter disc. The face follows the member's roster colour, which
 * the API hands out by join order (colorForIndex) — so the first seven people in
 * a group always get seven different faces, and the same member looks the same
 * on every screen. The name (aria-label / the text beside it) carries identity.
 */
const FACES = ['honza', 'klara', 'ondra', 'eva', 'petr', 'jirka', 'filip'] as const;
function faceFor(color: string, initials: string) {
  let i = (MEMBER_COLORS as readonly string[]).indexOf(color.toLowerCase());
  if (i < 0) i = [...(color + initials)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return `/marketing/avatars/${FACES[i % FACES.length]}.webp`;
}

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
  const style = { '--m': color } as React.CSSProperties;
  const letters = monogram(name, initials);
  // The monogram sits under the picture, so a late-loading image still shows
  // the initials rather than an empty circle. Fixed box: no shift on load.
  const inner = (
    <>
      {letters}
      <img
        src={imageUrl || faceFor(color, initials)}
        alt=""
        loading="lazy"
        decoding="async"
        className={`absolute inset-0 h-full w-full rounded-full object-cover ${imageUrl ? '' : 'app-face'}`}
      />
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
