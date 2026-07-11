/**
 * OpenRouter OCR adapter (PRD §6.2, §6.4). Sends a receipt image to OpenRouter's
 * chat completions endpoint with a strict `json_schema` response_format, using
 * the user's BYO key. Validates the result with zod, retries once on malformed
 * output, converts decimal prices to integer minor units, and reconciles the
 * item sum against the total.
 *
 * `fetchImpl` is injectable so the adapter is tested against recorded fixtures
 * with **no live API calls** in CI.
 */
import {
  currencyExponent,
  decimalStringToMinor,
  isSupportedCurrency,
  isExpenseCategory,
} from '@evenup/core';
import { receiptSchema, RECEIPT_JSON_SCHEMA, type RawReceipt } from './schema.js';

/** Map currency symbols / local strings the model may return to ISO 4217 codes. */
const CURRENCY_ALIASES: Record<string, string> = {
  KČ: 'CZK',
  KC: 'CZK',
  CZK: 'CZK',
  '€': 'EUR',
  EUR: 'EUR',
  $: 'USD',
  US$: 'USD',
  USD: 'USD',
  '£': 'GBP',
  GBP: 'GBP',
  ZŁ: 'PLN',
  ZL: 'PLN',
  PLN: 'PLN',
};

/** Resolve a model-reported currency to an ISO code, defaulting to the fallback. */
function normalizeCurrencyCode(raw: string, fallback: string): string {
  const cleaned = raw.trim().toUpperCase();
  if (isSupportedCurrency(cleaned)) return cleaned; // already a 3-letter code
  if (CURRENCY_ALIASES[cleaned]) return CURRENCY_ALIASES[cleaned];
  return isSupportedCurrency(fallback) ? fallback.toUpperCase() : 'USD';
}

export const DEFAULT_OCR_MODEL = 'google/gemini-2.5-flash';
export const DEFAULT_PDF_ENGINE = 'pdf-text';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const LOW_CONFIDENCE_THRESHOLD = 0.5;
const DEFAULT_TIMEOUT_MS = 60_000;

export class OcrError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'OcrError';
  }
}

export interface OcrItem {
  readonly name: string;
  /** The item name translated into the requested language, or null if none was
   * requested / the model omitted it. */
  readonly nameTranslated: string | null;
  readonly quantity: number;
  readonly unitPriceMinorUnits: number | null;
  readonly totalMinorUnits: number;
  readonly taxRate: number | null;
}

export interface OcrUsage {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly total_tokens?: number;
}

export interface OcrResult {
  readonly merchant: string | null;
  readonly date: string | null;
  /** Overall expense category key (a valid EXPENSE_CATEGORIES key), or null. */
  readonly category: string | null;
  readonly currency: string;
  readonly items: OcrItem[];
  readonly subtotalMinorUnits: number | null;
  readonly taxMinorUnits: number | null;
  readonly tipMinorUnits: number | null;
  readonly totalMinorUnits: number;
  readonly confidence: number;
  readonly lowConfidence: boolean;
  readonly reconciliation: {
    readonly itemsSumMinorUnits: number;
    readonly matchesTotal: boolean;
  };
  readonly usage?: OcrUsage;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ExtractReceiptArgs {
  readonly pages: string[];
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: FetchLike;
  /** Currency to use when the model returns an unrecognized/symbol currency. */
  readonly fallbackCurrency?: string;
  readonly pdfEngine?: string;
  /** UI language code (e.g. 'cs', 'en') to translate item names into. When set
   * and recognized, the model is asked to also return `nameTranslated`. */
  readonly targetLang?: string;
}

const BASE_PROMPT =
  'Extract the receipt as structured JSON. Czech receipts use comma decimals and "Kč". ' +
  'Return every line item with its name, quantity and total price. Amounts are major units (e.g. 24.90). ' +
  'The "currency" MUST be a 3-letter ISO 4217 code (e.g. CZK for Kč, EUR for €), never a symbol.' +
  ' Set "date" to the purchase date in ISO 8601 (YYYY-MM-DD) when the receipt shows one.' +
  ' Set "total" to the printed grand total; it need not equal the item sum (deposits, rounding, discounts).' +
  ' Classify the whole receipt into "category" — exactly one of: groceries, restaurant, transport,' +
  ' accommodation, entertainment, shopping, utilities, health, travel, other.' +
  ' The pages belong to ONE receipt (multiple screenshots or PDF pages) — combine them into a single receipt; do not duplicate items repeated in page headers/footers; the grand total appears once.';

// Language codes we can name for the model. Unknown codes skip translation.
const LANGUAGE_NAMES: Record<string, string> = { cs: 'Czech', en: 'English' };

/** Prompt text, optionally asking the model to translate each item name. */
function buildPrompt(targetLang?: string): string {
  const langName = targetLang ? LANGUAGE_NAMES[targetLang] : undefined;
  if (!langName) return BASE_PROMPT;
  return (
    BASE_PROMPT +
    ` Also translate each item's name into ${langName} and return it in "nameTranslated";` +
    ` keep the original receipt wording in "name". If a name is already in ${langName}, repeat it.`
  );
}

const isPdf = (dataUrl: string) => dataUrl.startsWith('data:application/pdf');

function buildBody(pages: string[], model: string, pdfEngine: string, targetLang?: string) {
  const parts = pages.map((p) =>
    isPdf(p)
      ? { type: 'file', file: { filename: 'receipt.pdf', file_data: p } }
      : { type: 'image_url', image_url: { url: p } },
  );
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'user', content: [{ type: 'text', text: buildPrompt(targetLang) }, ...parts] },
    ],
    response_format: { type: 'json_schema', json_schema: RECEIPT_JSON_SCHEMA },
  };
  if (pages.some(isPdf)) {
    body.plugins = [{ id: 'file-parser', pdf: { engine: pdfEngine } }];
  }
  return body;
}

/** Convert a decimal major-unit number to integer minor units for the currency. */
function toMinor(value: number, currency: string): number {
  const exp = currencyExponent(currency);
  return decimalStringToMinor(value.toFixed(exp), currency);
}

function normalize(raw: RawReceipt, fallbackCurrency: string): OcrResult {
  const currency = normalizeCurrencyCode(raw.currency, fallbackCurrency);
  const items: OcrItem[] = raw.items.map((it) => ({
    name: it.name,
    nameTranslated: it.nameTranslated ?? null,
    quantity: it.quantity,
    unitPriceMinorUnits:
      it.unitPrice === null || it.unitPrice === undefined ? null : toMinor(it.unitPrice, currency),
    totalMinorUnits: toMinor(it.totalPrice, currency),
    taxRate: it.taxRate ?? null,
  }));
  const totalMinorUnits = toMinor(raw.total, currency);
  const itemsSumMinorUnits = items.reduce((a, it) => a + it.totalMinorUnits, 0);

  return {
    merchant: raw.merchant ?? null,
    date: raw.date ?? null,
    // Trust only a category the app actually knows; anything else → null so the
    // UI falls back to its default rather than persisting a bogus key.
    category: raw.category && isExpenseCategory(raw.category) ? raw.category : null,
    currency,
    items,
    subtotalMinorUnits: raw.subtotal == null ? null : toMinor(raw.subtotal, currency),
    taxMinorUnits: raw.tax == null ? null : toMinor(raw.tax, currency),
    tipMinorUnits: raw.tip == null ? null : toMinor(raw.tip, currency),
    totalMinorUnits,
    confidence: raw.confidence,
    lowConfidence: raw.confidence < LOW_CONFIDENCE_THRESHOLD,
    reconciliation: {
      itemsSumMinorUnits,
      matchesTotal: itemsSumMinorUnits === totalMinorUnits,
    },
  };
}

async function callOnce(
  args: Required<Pick<ExtractReceiptArgs, 'apiKey' | 'model' | 'baseUrl' | 'timeoutMs'>> & {
    pages: string[];
    pdfEngine: string;
    targetLang?: string;
  },
  fetchImpl: FetchLike,
): Promise<{ content: string; usage?: OcrUsage }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(args.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildBody(args.pages, args.model, args.pdfEngine, args.targetLang)),
      signal: controller.signal,
    });
  } catch (err) {
    throw new OcrError('OCR request failed or timed out', err);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new OcrError(`OpenRouter returned HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: OcrUsage;
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new OcrError('OpenRouter response had no message content');
  }
  return { content, usage: json.usage };
}

function parseAndValidate(content: string): RawReceipt {
  const parsed: unknown = JSON.parse(content);
  return receiptSchema.parse(parsed);
}

/** Extract a structured receipt from an image. Retries once on malformed output. */
export async function extractReceipt(args: ExtractReceiptArgs): Promise<OcrResult> {
  const fetchImpl = args.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
  if (!fetchImpl) {
    throw new OcrError('No fetch implementation available');
  }
  const resolved = {
    pages: args.pages,
    apiKey: args.apiKey,
    model: args.model ?? DEFAULT_OCR_MODEL,
    baseUrl: args.baseUrl ?? OPENROUTER_URL,
    timeoutMs: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    pdfEngine: args.pdfEngine ?? DEFAULT_PDF_ENGINE,
    targetLang: args.targetLang,
  };

  const fallbackCurrency = args.fallbackCurrency ?? 'USD';
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { content, usage } = await callOnce(resolved, fetchImpl);
    try {
      const raw = parseAndValidate(content);
      return { ...normalize(raw, fallbackCurrency), usage };
    } catch (err) {
      lastError = err; // malformed JSON or failed validation — retry once (§6.4)
    }
  }
  throw new OcrError('OCR output could not be parsed after a retry', lastError);
}
