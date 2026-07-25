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

/**
 * Fold a display name to a comparable form: lowercase, diacritics stripped,
 * punctuation reduced to spaces, whitespace collapsed. Czech names differ from
 * their ASCII spellings only by diacritics ("Tomáš" / "Tomas"), and an
 * email-derived name arrives punctuated ("jan.novak"), so both must fold to the
 * same key before any comparison.
 */
export function normalizeForMatch(name: string): string {
  return name
    .normalize('NFD')
    // U+0300–U+036F: the combining diacritical marks NFD just split off.
    // Written as escapes on purpose — literal combining characters are
    // invisible in source and get mangled by copy-paste.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Dice coefficient over character bigrams; 1 = identical, 0 = nothing shared. */
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    bigrams.set(g, (bigrams.get(g) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const count = bigrams.get(g) ?? 0;
    if (count > 0) {
      bigrams.set(g, count - 1);
      hits++;
    }
  }
  return (2 * hits) / (a.length - 1 + (b.length - 1));
}

/**
 * How likely two display names refer to the same person, 0–1.
 *
 * Whole-string similarity alone scores "Marek" against "Marek Novák" poorly
 * (the surname is pure noise), yet that is the single most common duplicate
 * shape: `invite.claim` derives the new member's name from the account name or
 * the email local-part, which is usually just the given name (or a full name
 * whose given name leads). So a match on the *leading* token — "marek" is
 * token 0 of both "marek" and "marek novak" — counts as strong evidence on
 * its own.
 *
 * A match on a *trailing* token only (e.g. both names end in "novak") is
 * deliberately weak evidence instead of strong: Czech surnames like Novák,
 * Svoboda and Dvořák are shared by huge numbers of unrelated people, so two
 * different first names with the same surname ("Jan Novák" vs "Petr Novák")
 * must NOT clear the 0.8 duplicate-merge threshold. Do not special-case
 * specific surnames to fix false positives here — the leading-vs-trailing
 * position is what carries the signal, structurally, for any name.
 */
export function nameSimilarity(a: string, b: string): number {
  const left = normalizeForMatch(a);
  const right = normalizeForMatch(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftTokens = left.split(' ');
  const rightTokens = right.split(' ');
  const shared = leftTokens.filter((tok) => tok.length > 1 && rightTokens.includes(tok));
  const leadingTokenShared = leftTokens[0]!.length > 1 && leftTokens[0] === rightTokens[0];

  let tokenScore = 0;
  if (leadingTokenShared) {
    // The given name matches — strong evidence on its own, plus a small bonus
    // if other tokens (e.g. the surname too) also match.
    tokenScore = 0.8 + 0.2 * (shared.length / Math.max(leftTokens.length, rightTokens.length));
  } else if (shared.length > 0) {
    // Only a trailing token (surname) matches — weak evidence, capped well
    // below the 0.8 merge threshold on purpose.
    tokenScore = 0.4 + 0.2 * (shared.length / Math.max(leftTokens.length, rightTokens.length));
  }

  return Math.max(tokenScore, diceCoefficient(left, right));
}
