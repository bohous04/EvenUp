/**
 * CSV expense import (PRD Phase 4 / FR roadmap). A small RFC-4180-ish parser
 * plus a header-aware normalizer that maps rows (Splitwise-style exports and
 * generic CSVs) to expense records in integer minor units. Pure and tested.
 */
import { decimalStringToMinor } from '../money/currency.js';

/** Parse CSV text into rows of fields. Handles quotes, escaped quotes, CRLF. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let sawAny = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    // Skip rows that are entirely empty (e.g. a trailing newline).
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      sawAny = true;
    } else if (ch === delimiter) {
      pushField();
      sawAny = true;
    } else if (ch === '\n') {
      pushRow();
    } else if (ch === '\r') {
      // handled with the following \n (or ignored)
    } else {
      field += ch;
      if (ch.trim() !== '') sawAny = true;
    }
  }
  // Final field/row (no trailing newline).
  if (field !== '' || row.length > 0) pushRow();

  return sawAny ? rows.filter((r) => r.some((c) => c.trim() !== '')) : [];
}

export interface ParsedExpenseRow {
  readonly date: string;
  readonly title: string;
  readonly currency: string;
  readonly amountMinorUnits: number;
  readonly category?: string;
}

export interface CsvRowError {
  readonly line: number;
  readonly message: string;
}

export interface ParseExpensesOptions {
  readonly defaultCurrency: string;
  readonly delimiter?: string;
}

const HEADER_ALIASES: Record<string, string[]> = {
  date: ['date', 'datum'],
  title: ['title', 'description', 'desc', 'popis', 'nazev', 'název'],
  amount: ['amount', 'cost', 'price', 'total', 'castka', 'částka', 'cena'],
  currency: ['currency', 'mena', 'měna'],
  category: ['category', 'kategorie'],
};

function resolveColumns(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((raw, i) => {
    const key = raw.trim().toLowerCase();
    for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(key)) map[canonical] = i;
    }
  });
  return map;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a CSV export into normalized expense rows, collecting per-row errors. */
export function parseExpensesCsv(
  text: string,
  options: ParseExpensesOptions,
): { rows: ParsedExpenseRow[]; errors: CsvRowError[] } {
  const delimiter = options.delimiter ?? ',';
  const all = parseCsv(text, delimiter);
  if (all.length === 0) {
    return { rows: [], errors: [] };
  }
  const cols = resolveColumns(all[0]!);
  if (cols.date === undefined || cols.title === undefined || cols.amount === undefined) {
    throw new Error('CSV must have date, description/title and amount/cost columns');
  }

  const rows: ParsedExpenseRow[] = [];
  const errors: CsvRowError[] = [];

  for (let r = 1; r < all.length; r++) {
    const line = r + 1; // 1-based incl. header
    const record = all[r]!;
    const date = (record[cols.date] ?? '').trim();
    const title = (record[cols.title] ?? '').trim();
    const currency =
      (cols.currency !== undefined ? record[cols.currency] : '')?.trim() || options.defaultCurrency;
    const amountRaw = (record[cols.amount] ?? '').trim();
    const category =
      cols.category !== undefined ? (record[cols.category] ?? '').trim() || undefined : undefined;

    if (!ISO_DATE.test(date)) {
      errors.push({ line, message: `Invalid date: ${JSON.stringify(date)}` });
      continue;
    }
    if (!title) {
      errors.push({ line, message: 'Missing description' });
      continue;
    }
    let amountMinorUnits: number;
    try {
      amountMinorUnits = decimalStringToMinor(amountRaw, currency);
    } catch {
      errors.push({ line, message: `Invalid amount: ${JSON.stringify(amountRaw)}` });
      continue;
    }
    rows.push({ date, title, currency: currency.toUpperCase(), amountMinorUnits, category });
  }

  return { rows, errors };
}
