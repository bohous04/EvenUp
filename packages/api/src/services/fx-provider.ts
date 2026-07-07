/**
 * FX provider fetch (PRD §4.8, FR-8.2). Frankfurter returns the multiplier
 * `from -> to`; with from=quote, to=base this is `base = quote * rate`, matching
 * @evenup/core `convert`. Returns null on any error/timeout (never throws) so the
 * caller can fall back to a cached rate or manual entry. Injectable fetch =>
 * no live calls in CI.
 */
import type { FetchLike } from '../ocr/openrouter-adapter.js';

export interface FetchRateArgs {
  readonly baseCurrency: string;
  readonly quoteCurrency: string;
  readonly date: Date;
  readonly providerUrl: string;
  readonly fetchImpl: FetchLike;
  readonly timeoutMs?: number;
}

export async function fetchRate(
  args: FetchRateArgs,
): Promise<{ rateDecimal: string; source: string } | null> {
  const day = args.date.toISOString().slice(0, 10);
  const base = args.providerUrl.replace(/\/$/, '');
  const url = `${base}/${day}?from=${args.quoteCurrency}&to=${args.baseCurrency}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 10_000);
  try {
    const res = await args.fetchImpl(url, { method: 'GET', signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number> };
    const rate = json.rates?.[args.baseCurrency];
    if (typeof rate !== 'number' || !(rate > 0)) return null;
    return { rateDecimal: String(rate), source: 'frankfurter' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
