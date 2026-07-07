/** Activity log read + filtering (PRD §4.9, FR-9.1/9.2). */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { assertGroupAccess } from '../access.js';

export const activityRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        memberId: z.string().optional(),
        action: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);

      // The actor is a User; map a member filter to that member's linked userId.
      let actorId: string | undefined;
      if (input.memberId) {
        const member = await ctx.prisma.member.findUnique({
          where: { id: input.memberId },
          select: { userId: true },
        });
        actorId = member?.userId ?? '__none__'; // virtual members are never actors
      }

      const rows = await ctx.prisma.activityLog.findMany({
        where: { groupId: input.groupId, action: input.action, actorId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          actor: {
            select: { members: { where: { groupId: input.groupId }, select: { displayName: true } } },
          },
        },
      });

      const nextCursor = rows.length > input.limit ? (rows.pop()?.id ?? null) : null;
      return {
        items: rows.map((r) => ({
          id: r.id,
          action: r.action,
          payload: r.payload as unknown,
          createdAt: r.createdAt,
          actorName: r.actor?.members[0]?.displayName ?? null,
        })),
        nextCursor,
      };
    }),
});
