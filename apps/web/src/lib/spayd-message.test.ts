import { describe, expect, test } from 'vitest';
import { SPAYD_MESSAGE_MAX_LENGTH, clampSpaydMessage } from './spayd-message';

describe('clampSpaydMessage', () => {
  test('leaves a message well under the limit untouched', () => {
    const message = 'Vyrovnání dluhu Víkend na horách';
    expect(clampSpaydMessage(message)).toBe(message);
  });

  test('leaves a message at exactly the limit untouched', () => {
    const message = 'Vyrovnání dluhu '.padEnd(SPAYD_MESSAGE_MAX_LENGTH, 'x');
    expect(message.length).toBe(SPAYD_MESSAGE_MAX_LENGTH);
    expect(clampSpaydMessage(message)).toBe(message);
  });

  test('clamps a message over the limit to exactly the limit', () => {
    // A group name at the schema's 120-char cap (packages/api/src/schemas.ts)
    // pushes "Vyrovnání dluhu " + name well past 60 — ordinary data, not an edge case.
    const groupName = 'A'.repeat(120);
    const message = `Vyrovnání dluhu ${groupName}`;
    const clamped = clampSpaydMessage(message);
    expect(clamped.length).toBe(SPAYD_MESSAGE_MAX_LENGTH);
    expect(clamped).toBe(message.slice(0, SPAYD_MESSAGE_MAX_LENGTH));
  });
});
