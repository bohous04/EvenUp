/**
 * Exchange-rate resolution (PRD §4.8). A rate converts an amount in the
 * transaction currency into the group's base currency: `base = amount * rate`.
 *
 * Resolution order: same currency → 1; explicit override; a per-group locked
 * rate; the cached daily `FxRate` row; otherwise an error (the caller surfaces
 * "enter the rate manually").
 */
import { convert, parseRate } from '@evenup/core';
import type { Prisma, PrismaClient } from '@evenup/db';

export interface ResolvedRate {
  readonly rateDecimal: string;
  readonly baseMinorUnits: number;
  readonly overridden: boolean;
}

export async function resolveRateDecimal(
  prisma: PrismaClient,
  fromCurrency: string,
  baseCurrency: string,
  date: Date,
  override?: string,
  lockedRate?: Prisma.Decimal | null,
): Promise<{ rateDecimal: string; overridden: boolean }> {
  if (fromCurrency === baseCurrency) {
    return { rateDecimal: '1', overridden: false };
  }
  if (override) {
    return { rateDecimal: override, overridden: true };
  }
  if (lockedRate) {
    return { rateDecimal: lockedRate.toString(), overridden: false };
  }
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const row = await prisma.fxRate.findUnique({
    where: { base_quote_date: { base: baseCurrency, quote: fromCurrency, date: day } },
  });
  if (row) {
    return { rateDecimal: row.rate.toString(), overridden: false };
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
