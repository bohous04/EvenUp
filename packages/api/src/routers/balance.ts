/** Balances & suggested settlements (PRD §4.6). */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { assertGroupAccess } from '../access.js';
import { getGroupBalances, getNextRound, getMemberBreakdown } from '../services/balance-service.js';

export const balanceRouter = router({
  get: protectedProcedure.input(z.object({ groupId: z.string() })).query(async ({ ctx, input }) => {
    await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
    return getGroupBalances(ctx.prisma, input.groupId);
  }),

  memberBreakdown: protectedProcedure
    .input(z.object({ groupId: z.string(), memberId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      return getMemberBreakdown(ctx.prisma, input.groupId, input.memberId);
    }),

  nextPayer: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      return getNextRound(ctx.prisma, input.groupId);
    }),
});
