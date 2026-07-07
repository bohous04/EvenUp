/** Group spend statistics (PRD FR-12.2). */
import { z } from 'zod';
import { summarizeByCategory, type Categorizable } from '@evenup/core';
import { toMinor } from '@evenup/db';
import { router, protectedProcedure } from '../trpc.js';
import { assertGroupAccess } from '../access.js';

export const statsRouter = router({
  byCategory: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      const txns = await ctx.prisma.transaction.findMany({
        where: { groupId: input.groupId },
        select: { type: true, category: true, baseMinorUnits: true },
      });
      const entries: Categorizable[] = txns.map((t) => ({
        type: t.type.toLowerCase() as Categorizable['type'],
        category: t.category,
        baseMinorUnits: toMinor(t.baseMinorUnits),
      }));
      return summarizeByCategory(entries);
    }),
});
