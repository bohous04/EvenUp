import { describe, it, expect } from 'vitest';
import { expandItemQuantities } from './expand-items';

describe('expandItemQuantities', () => {
  it('keeps a single-unit item as one line', () => {
    expect(
      expandItemQuantities([{ name: 'Čokoláda', quantity: 1, totalMinorUnits: 2500 }]),
    ).toEqual([{ name: 'Čokoláda', totalMinorUnits: 2500 }]);
  });

  it('expands a whole quantity into that many equal lines', () => {
    expect(
      expandItemQuantities([{ name: 'Čokoláda', quantity: 3, totalMinorUnits: 7500 }]),
    ).toEqual([
      { name: 'Čokoláda', totalMinorUnits: 2500 },
      { name: 'Čokoláda', totalMinorUnits: 2500 },
      { name: 'Čokoláda', totalMinorUnits: 2500 },
    ]);
  });

  it('distributes the remainder so expanded lines still sum to the line total', () => {
    const out = expandItemQuantities([{ name: 'Rohlík', quantity: 3, totalMinorUnits: 7501 }]);
    expect(out).toEqual([
      { name: 'Rohlík', totalMinorUnits: 2501 },
      { name: 'Rohlík', totalMinorUnits: 2500 },
      { name: 'Rohlík', totalMinorUnits: 2500 },
    ]);
    expect(out.reduce((s, it) => s + it.totalMinorUnits, 0)).toBe(7501);
  });

  it('does not expand a fractional quantity (e.g. weighed goods)', () => {
    expect(
      expandItemQuantities([{ name: 'Jablka', quantity: 1.5, totalMinorUnits: 6000 }]),
    ).toEqual([{ name: 'Jablka', totalMinorUnits: 6000 }]);
  });

  it('does not expand beyond the safety cap, keeping the line intact', () => {
    const out = expandItemQuantities([{ name: 'Šroub', quantity: 500, totalMinorUnits: 50000 }]);
    expect(out).toEqual([{ name: 'Šroub', totalMinorUnits: 50000 }]);
  });

  it('preserves item order when expanding a mix', () => {
    expect(
      expandItemQuantities([
        { name: 'Pivo', quantity: 2, totalMinorUnits: 8000 },
        { name: 'Voda', quantity: 1, totalMinorUnits: 2000 },
      ]),
    ).toEqual([
      { name: 'Pivo', totalMinorUnits: 4000 },
      { name: 'Pivo', totalMinorUnits: 4000 },
      { name: 'Voda', totalMinorUnits: 2000 },
    ]);
  });
});
