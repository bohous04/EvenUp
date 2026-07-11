/**
 * Member identity helpers: deterministic initials and chip colors derived
 * identically on web and mobile (so the same member always looks the same).
 * (PRD FR-2.2; accessibility §9.4 — color is never the only signal, initials
 * always accompany the chip.)
 */

/**
 * A palette of distinct, reasonably accessible chip colors. Kept deliberately
 * saturated so white initials read clearly on top.
 */
export const MEMBER_COLORS = [
  '#e11d48', // rose
  '#f97316', // orange
  '#eab308', // amber
  '#22c55e', // green
  '#14b8a6', // teal
  '#0ea5e9', // sky
  '#4f46e5', // indigo
  '#a855f7', // purple
  '#ec4899', // pink
  '#84cc16', // lime
  '#06b6d4', // cyan
  '#f43f5e', // red
] as const;

export type MemberColor = (typeof MEMBER_COLORS)[number];

/** Derive up to two uppercase initials from a display name. */
export function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) {
    const word = words[0]!;
    return word.slice(0, 2).toUpperCase();
  }
  const first = words[0]![0]!;
  const last = words[words.length - 1]![0]!;
  return (first + last).toUpperCase();
}

/** Pick a palette color by index, wrapping around (negative-safe). */
export function colorForIndex(index: number): MemberColor {
  const n = MEMBER_COLORS.length;
  const i = ((Math.trunc(index) % n) + n) % n;
  return MEMBER_COLORS[i]!;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new TypeError(`Invalid hex color: ${JSON.stringify(hex)}`);
  const int = parseInt(m[1]!, 16);
  return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Pick black or white text for a background color — whichever yields the higher
 * WCAG contrast ratio — so chip initials stay readable on every palette color
 * (accessibility §9.4).
 */
export function readableTextColor(backgroundHex: string): '#0a0a0a' | '#ffffff' {
  const lum = relativeLuminance(hexToRgb(backgroundHex));
  const contrastWithWhite = 1.05 / (lum + 0.05);
  const contrastWithBlack = (lum + 0.05) / 0.05;
  return contrastWithBlack >= contrastWithWhite ? '#0a0a0a' : '#ffffff';
}

/**
 * The avatar image to actually render for a linked user, honoring their
 * "use my initials + color instead of my photo" preference (FR-2.2). Returns
 * null when the user opted out or has no photo, so callers fall back to the
 * monogram. Resolving this in one place stops the preference from silently
 * leaking through a call site that forgot the check.
 */
export function visibleAvatar(
  user: { image?: string | null; hideProfilePhoto?: boolean | null } | null | undefined,
): string | null {
  return (user?.hideProfilePhoto ? null : user?.image) ?? null;
}

/** Pick a deterministic palette color from an arbitrary string key. */
export function colorForKey(key: string): MemberColor {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return colorForIndex(Math.abs(hash));
}
