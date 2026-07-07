/**
 * Exchange-rate resolution (PRD §4.8). A rate converts an amount in the
 * transaction currency into the group's base currency: `base = amount * rate`.
 *
 * Resolution order: same currency → 1; explicit override; a per-group locked
 * rate; the cached daily `FxRate` row; an on-demand provider fetch (cached for
 * reuse) when a fetch impl is injected; the newest cached rate for the pair
 * (flagged `stale`) if the provider fails; otherwise an error (the caller
 * surfaces "enter the rate manually"). No fetch impl => no live calls (tests).
 */
import { convert, parseRate } from '@evenup/core';
import { Prisma, type PrismaClient } from '@evenup/db';
import type { FetchLike } from '../ocr/openrouter-adapter.js';
import { fetchRate } from './fx-provider.js';

export interface ResolvedRate {
  readonly rateDecimal: string;
  readonly baseMinorUnits: number;
  readonly overridden: boolean;
}

export interface ResolveRateFetch {
  readonly fetchImpl: FetchLike;
  readonly providerUrl: string;
}

export interface ResolvedRateInfo {
  readonly rateDecimal: string;
  readonly overridden: boolean;
  readonly source: string;
  readonly stale: boolean;
}

export async function resolveRateDecimal(
  prisma: PrismaClient,
  fromCurrency: string,
  baseCurrency: string,
  date: Date,
  override?: string,
  lockedRate?: Prisma.Decimal | null,
  fetch?: ResolveRateFetch,
): Promise<ResolvedRateInfo> {
  if (fromCurrency === baseCurrency) {
    return { rateDecimal: '1', overridden: false, source: 'identity', stale: false };
  }
  if (override) {
    return { rateDecimal: override, overridden: true, source: 'override', stale: false };
  }
  if (lockedRate) {
    return { rateDecimal: lockedRate.toString(), overridden: false, source: 'locked', stale: false };
  }
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const row = await prisma.fxRate.findUnique({
    where: { base_quote_date: { base: baseCurrency, quote: fromCurrency, date: day } },
  });
  if (row) {
    return { rateDecimal: row.rate.toString(), overridden: false, source: row.source, stale: false };
  }
  if (fetch?.fetchImpl) {
    const fetched = await fetchRate({
      baseCurrency,
      quoteCurrency: fromCurrency,
      date: day,
      providerUrl: fetch.providerUrl,
      fetchImpl: fetch.fetchImpl,
    });
    if (fetched) {
      await prisma.fxRate.upsert({
        where: { base_quote_date: { base: baseCurrency, quote: fromCurrency, date: day } },
        create: {
          base: baseCurrency,
          quote: fromCurrency,
          rate: new Prisma.Decimal(fetched.rateDecimal),
          date: day,
          source: fetched.source,
        },
        update: { rate: new Prisma.Decimal(fetched.rateDecimal), source: fetched.source },
      });
      return { rateDecimal: fetched.rateDecimal, overridden: false, source: fetched.source, stale: false };
    }
    const latest = await prisma.fxRate.findFirst({
      where: { base: baseCurrency, quote: fromCurrency },
      orderBy: { date: 'desc' },
    });
    if (latest) {
      return { rateDecimal: latest.rate.toString(), overridden: false, source: latest.source, stale: true };
    }
  }
  throw new Error(
    `No exchange rate for ${fromCurrency}->${baseCurrency} on ${day.toISOString().slice(0, 10)}; provide one manually.`,
  );
}

/** Convert a transaction-currency amount to base currency minor units. */
export function convertToBase(
  amountMinor: number,
  fromCurrency: string,
  baseCurrency: string,
  rateDecimal: string,
): number {
  if (fromCurrency === baseCurrency) return amountMinor;
  return convert(amountMinor, fromCurrency, baseCurrency, parseRate(rateDecimal));
}
