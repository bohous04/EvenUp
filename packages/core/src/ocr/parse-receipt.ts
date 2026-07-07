/**
 * Heuristic receipt structuring for on-device OCR (e.g. Apple Vision), which
 * yields raw text lines but no structure. Turns those lines into items, a total,
 * a merchant and a currency — float-free, integer minor units throughout.
 *
 * This is intentionally best-effort: the inline item editor lets the user fix
 * anything it gets wrong (FR-5.6). It is *not* a replacement for the LLM's
 * understanding, but needs no API key and runs entirely offline.
 */
import {
  currencyExponent,
  decimalStringToMinor,
  isSupportedCurrency,
  type CurrencyCode,
} from '../money/currency.js';

/** Normalized bounding box as returned by Vision (origin bottom-left, 0..1). */
export interface OcrBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrLine {
  text: string;
  /** Recognition confidence, 0..1. */
  confidence: number;
  box?: OcrBox;
}

export interface ParsedReceiptItem {
  name: string;
  totalMinorUnits: number;
}

export interface ParsedReceipt {
  merchant: string | null;
  currency: string;
  items: ParsedReceiptItem[];
  subtotalMinorUnits: number | null;
  totalMinorUnits: number;
  /** Mean recognition confidence of the accepted item lines, 0..1. */
  confidence: number;
}

// Currency detected from a symbol or ISO code anywhere in the text.
const CURRENCY_HINTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/kč|kc\b|czk/i, 'CZK'],
  [/€|eur\b/i, 'EUR'],
  [/\$|usd\b/i, 'USD'],
  [/£|gbp\b/i, 'GBP'],
  [/zł|zl\b|pln/i, 'PLN'],
];

// Keyword buckets (matched case-insensitively as substrings). Subtotal is
// checked before total because "subtotal" contains "total".
const SUBTOTAL_KW = ['subtotal', 'mezisoučet', 'mezisoucet', 'medzisúčet'];
const TOTAL_KW = [
  'total',
  'celkem',
  'suma',
  'k úhradě',
  'k uhrade',
  'zaplatit',
  'gesamt',
  'summe',
  'to pay',
];
// Priced lines that are never items (tax, payment, change, discounts…).
const SKIP_KW = [
  'vat',
  'dph',
  'tax',
  'change',
  'hotovost',
  'cash',
  'card',
  'karta',
  'visa',
  'mastercard',
  'maestro',
  'zaokrouhlení',
  'zaokrouhleni',
  'rounding',
  'balance',
  'tip',
  'spropitné',
  'spropitne',
  'discount',
  'sleva',
  'platba',
];

/** A price token like `2.50`, `24,90`, `1 234,50` or `1.234,50` → integer minor units. */
function priceToMinor(token: string, currency: CurrencyCode): number | null {
  const m = /^(.*)[.,](\d{2})$/.exec(token.trim());
  if (!m) return null;
  const intPart = m[1]!.replace(/\D/g, ''); // strip spaces + thousands separators
  if (!intPart) return null;
  try {
    return decimalStringToMinor(`${intPart}.${m[2]}`, currency);
  } catch {
    return null;
  }
}

/** The right-most price on a line (the amount column) with its raw match text. */
function lastPrice(text: string, currency: CurrencyCode): { minor: number; match: string } | null {
  const re = /(?:\d{1,3}(?:[ .]\d{3})*|\d+)[.,]\d{2}(?!\d)/g;
  const matches = [...text.matchAll(re)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const minor = priceToMinor(matches[i]![0], currency);
    if (minor !== null) return { minor, match: matches[i]![0] };
  }
  return null;
}

function stripPrice(text: string, match: string): string {
  const idx = text.lastIndexOf(match);
  const without = idx < 0 ? text : text.slice(0, idx) + text.slice(idx + match.length);
  return without.replace(/^[\s.,;:×x*–-]+|[\s.,;:×x*–-]+$/g, '').trim();
}

function detectCurrency(text: string, fallback: string): string {
  for (const [re, code] of CURRENCY_HINTS) if (re.test(text)) return code;
  return isSupportedCurrency(fallback) ? fallback.toUpperCase() : 'CZK';
}

const has = (haystack: string, kw: readonly string[]) => kw.some((k) => haystack.includes(k));

export function parseReceiptText(
  input: readonly OcrLine[],
  opts: { fallbackCurrency: string },
): ParsedReceipt {
  // Vision's origin is bottom-left, so a larger y sits higher on the receipt.
  const ordered =
    input.length > 0 && input.every((l) => l.box)
      ? [...input].sort((a, b) => b.box!.y - a.box!.y)
      : [...input];

  const currency = detectCurrency(ordered.map((l) => l.text).join('\n'), opts.fallbackCurrency);
  // Guard against exotic exponents so decimalStringToMinor never throws downstream.
  currencyExponent(currency);

  const items: ParsedReceiptItem[] = [];
  const confidences: number[] = [];
  let totalMinorUnits: number | null = null;
  let subtotalMinorUnits: number | null = null;
  let merchant: string | null = null;

  for (const line of ordered) {
    const text = line.text.trim();
    if (!text) continue;
    const price = lastPrice(text, currency);
    const lower = text.toLowerCase();

    if (!price) {
      if (merchant === null && /\p{L}/u.test(text)) merchant = text;
      continue;
    }

    if (has(lower, SUBTOTAL_KW)) {
      subtotalMinorUnits = price.minor;
      continue;
    }
    if (has(lower, TOTAL_KW)) {
      totalMinorUnits = price.minor;
      continue;
    }
    if (has(lower, SKIP_KW)) continue;

    const name = stripPrice(text, price.match);
    if (!name || !/\p{L}/u.test(name)) continue; // bare price / no real name

    items.push({ name, totalMinorUnits: price.minor });
    confidences.push(line.confidence);
  }

  const itemsSum = items.reduce((sum, i) => sum + i.totalMinorUnits, 0);
  const confidence = confidences.length
    ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
    : 0;

  return {
    merchant,
    currency,
    items,
    subtotalMinorUnits,
    totalMinorUnits: totalMinorUnits ?? itemsSum,
    confidence,
  };
}
