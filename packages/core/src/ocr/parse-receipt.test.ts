import { describe, expect, it } from 'vitest';
import { parseReceiptText, type OcrLine } from './parse-receipt.js';

/** Build plain-text lines (no bounding boxes), full confidence, in visual order. */
function lines(...texts: string[]): OcrLine[] {
  return texts.map((text) => ({ text, confidence: 0.95 }));
}

describe('parseReceiptText', () => {
  it('extracts items, total and merchant from a simple receipt', () => {
    const r = parseReceiptText(
      lines('COFFEE HOUSE', 'Espresso 2.50', 'Cappuccino 3.00', 'Croissant 2.20', 'Total 7.70'),
      { fallbackCurrency: 'EUR' },
    );
    expect(r.merchant).toBe('COFFEE HOUSE');
    expect(r.currency).toBe('EUR');
    expect(r.items).toEqual([
      { name: 'Espresso', totalMinorUnits: 250 },
      { name: 'Cappuccino', totalMinorUnits: 300 },
      { name: 'Croissant', totalMinorUnits: 220 },
    ]);
    expect(r.totalMinorUnits).toBe(770);
  });

  it('detects CZK from the Kč symbol and parses comma decimals', () => {
    const r = parseReceiptText(
      lines('Potraviny s.r.o.', 'Rohlík 3,50', 'Mléko 24,90', 'Celkem 28,40 Kč'),
      { fallbackCurrency: 'EUR' },
    );
    expect(r.currency).toBe('CZK');
    expect(r.items).toEqual([
      { name: 'Rohlík', totalMinorUnits: 350 },
      { name: 'Mléko', totalMinorUnits: 2490 },
    ]);
    expect(r.totalMinorUnits).toBe(2840);
  });

  it('excludes tax, payment and change lines from items', () => {
    const r = parseReceiptText(
      lines('Shop', 'Milk 1.20', 'Total 1.20', 'VAT 21% 0.21', 'VISA 1.20', 'Change 0.00'),
      { fallbackCurrency: 'EUR' },
    );
    expect(r.items).toEqual([{ name: 'Milk', totalMinorUnits: 120 }]);
    expect(r.totalMinorUnits).toBe(120);
  });

  it('falls back to the sum of items when there is no total line', () => {
    const r = parseReceiptText(lines('Kiosk', 'Water 1.00', 'Gum 0.80'), {
      fallbackCurrency: 'USD',
    });
    expect(r.totalMinorUnits).toBe(180);
    expect(r.items).toHaveLength(2);
  });

  it('records a subtotal line separately from items', () => {
    const r = parseReceiptText(
      lines('Store', 'Bread 2.00', 'Butter 3.00', 'Subtotal 5.00', 'Total 5.00'),
      { fallbackCurrency: 'EUR' },
    );
    expect(r.subtotalMinorUnits).toBe(500);
    expect(r.items.map((i) => i.name)).toEqual(['Bread', 'Butter']);
  });

  it('normalizes thousands separators in prices', () => {
    const r = parseReceiptText(lines('Elektro', 'Notebook 25 999,00', 'Celkem 25 999,00 Kč'), {
      fallbackCurrency: 'CZK',
    });
    expect(r.items).toEqual([{ name: 'Notebook', totalMinorUnits: 2599900 }]);
    expect(r.totalMinorUnits).toBe(2599900);
  });

  it('uses the fallback currency when none is detected', () => {
    const r = parseReceiptText(lines('Bar', 'Beer 5.00', 'Total 5.00'), {
      fallbackCurrency: 'GBP',
    });
    expect(r.currency).toBe('GBP');
  });

  it('orders lines top-to-bottom by bounding box (Vision origin is bottom-left)', () => {
    // Given out of order; higher y = higher up on the receipt.
    const boxed: OcrLine[] = [
      { text: 'Total 3.00', confidence: 0.9, box: { x: 0, y: 0.1, width: 1, height: 0.05 } },
      { text: 'Tea 3.00', confidence: 0.9, box: { x: 0, y: 0.5, width: 1, height: 0.05 } },
      { text: 'TEA ROOM', confidence: 0.9, box: { x: 0, y: 0.9, width: 1, height: 0.05 } },
    ];
    const r = parseReceiptText(boxed, { fallbackCurrency: 'EUR' });
    expect(r.merchant).toBe('TEA ROOM');
    expect(r.items).toEqual([{ name: 'Tea', totalMinorUnits: 300 }]);
  });

  it('returns an empty, zeroed result for lines with no prices', () => {
    const r = parseReceiptText(lines('Just a note', 'No numbers here'), {
      fallbackCurrency: 'EUR',
    });
    expect(r.items).toEqual([]);
    expect(r.totalMinorUnits).toBe(0);
  });
});
