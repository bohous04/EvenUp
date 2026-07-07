import { describe, expect, test } from 'vitest';
import {
  deriveInitials,
  MEMBER_COLORS,
  colorForIndex,
  colorForKey,
  readableTextColor,
} from './identity.js';

// WCAG relative luminance + contrast ratio for verifying the palette.
function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const int = parseInt(hex.slice(1), 16);
    const ch = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return (
      0.2126 * ch((int >> 16) & 0xff) + 0.7152 * ch((int >> 8) & 0xff) + 0.0722 * ch(int & 0xff)
    );
  };
  const a = lum(hexA);
  const b = lum(hexB);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

describe('deriveInitials (FR-2.2)', () => {
  test('takes the first letters of the first and last words', () => {
    expect(deriveInitials('Olivia Nováková')).toBe('ON');
  });

  test('takes the first two letters of a single name', () => {
    expect(deriveInitials('Petr')).toBe('PE');
  });

  test('upper-cases and preserves Czech diacritics', () => {
    expect(deriveInitials('žofie čermáková')).toBe('ŽČ');
  });

  test('handles a single-character name', () => {
    expect(deriveInitials('X')).toBe('X');
  });

  test('collapses extra whitespace', () => {
    expect(deriveInitials('  Jan   Marek  Novák ')).toBe('JN');
  });

  test('falls back to a placeholder for an empty name', () => {
    expect(deriveInitials('   ')).toBe('?');
  });
});

describe('member colors (§9.4 — never color alone, but distinct chips)', () => {
  test('exposes a non-empty palette of hex colors', () => {
    expect(MEMBER_COLORS.length).toBeGreaterThan(6);
    for (const c of MEMBER_COLORS) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test('colorForIndex wraps around the palette', () => {
    expect(colorForIndex(0)).toBe(MEMBER_COLORS[0]);
    expect(colorForIndex(MEMBER_COLORS.length)).toBe(MEMBER_COLORS[0]);
    expect(colorForIndex(MEMBER_COLORS.length + 1)).toBe(MEMBER_COLORS[1]);
  });

  test('colorForIndex handles negative indices safely', () => {
    expect(MEMBER_COLORS).toContain(colorForIndex(-1));
  });

  test('colorForKey is deterministic for the same key', () => {
    expect(colorForKey('Olivia')).toBe(colorForKey('Olivia'));
    expect(MEMBER_COLORS).toContain(colorForKey('Olivia'));
  });

  test('readableTextColor gives WCAG AA contrast (>= 4.5:1) on every palette color', () => {
    for (const bg of MEMBER_COLORS) {
      const fg = readableTextColor(bg);
      expect(contrastRatio(bg, fg), `${bg} on ${fg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('readableTextColor picks white on dark and black on light', () => {
    expect(readableTextColor('#000000')).toBe('#ffffff');
    expect(readableTextColor('#ffffff')).toBe('#0a0a0a');
  });

  test('readableTextColor rejects malformed input', () => {
    expect(() => readableTextColor('nope')).toThrow();
  });
});
