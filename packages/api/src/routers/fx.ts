/** Exchange-rate lookup & manual entry (PRD §4.8). */
import { z } from 'zod';
import { Prisma } from '@evenup/db';
import { router, protectedProcedure } from '../trpc.js';
import { currencyCode } from '../schemas.js';

export const fxRouter = router({
  /** Latest known rate for base->quote (most recent cached row). */
  latest: protectedProcedure
    .input(z.object({ base: currencyCode, quote: currencyCode }))
    .query(async ({ ctx, input }) => {
      if (input.base === input.quote) return { rate: '1', date: null, source: 'identity' };
      const row = await ctx.prisma.fxRate.findFirst({
        where: { base: input.base, quote: input.quote },
        orderBy: { date: 'desc' },
      });
      return row ? { rate: row.rate.toString(), date: row.date, source: row.source } : null;
    }),

  /** Manually upsert a rate for a day (override / offline, FR-8.3/8.5). */
  setManual: protectedProcedure
    .input(
      z.object({
        base: currencyCode,
        quote: currencyCode,
        rate: z.string().regex(/^\d+([.,]\d+)?$/),
        date: z.coerce.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const day = new Date(
        Date.UTC(input.date.getUTCFullYear(), input.date.getUTCMonth(), input.date.getUTCDate()),
      );
      return ctx.prisma.fxRate.upsert({
        where: { base_quote_date: { base: input.base, quote: input.quote, date: day } },
        create: {
          base: input.base,
          quote: input.quote,
          rate: new Prisma.Decimal(input.rate.replace(',', '.')),
          date: day,
          source: 'manual',
        },
        update: { rate: new Prisma.Decimal(input.rate.replace(',', '.')), source: 'manual' },
      });
    }),
});
