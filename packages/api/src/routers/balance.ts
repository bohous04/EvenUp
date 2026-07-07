/** Balances & suggested settlements (PRD §4.6). */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { assertGroupAccess } from '../access.js';
import { getGroupBalances } from '../services/balance-service.js';

export const balanceRouter = router({
  get: protectedProcedure.input(z.object({ groupId: z.string() })).query(async ({ ctx, input }) => {
    await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
    return getGroupBalances(ctx.prisma, input.groupId);
  }),
});
