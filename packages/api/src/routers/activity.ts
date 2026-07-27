/** Activity log read + filtering (PRD §4.9, FR-9.1/9.2). */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { assertGroupAccess } from '../access.js';
import { pickActivityPayload } from '../services/activity.js';

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
        const member = await ctx.prisma.member.findFirst({
          where: { id: input.memberId, groupId: input.groupId },
          select: { userId: true },
        });
        actorId = member?.userId ?? '__none__'; // virtual members are never actors
      }

      const rows = await ctx.prisma.activityLog.findMany({
        where: { groupId: input.groupId, action: input.action, actorId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor } } : {}),
        include: {
          actor: {
            select: {
              members: { where: { groupId: input.groupId }, select: { displayName: true } },
            },
          },
        },
      });

      const nextCursor = rows.length > input.limit ? (rows.pop()?.id ?? null) : null;
      return {
        items: rows.map((r) => ({
          id: r.id,
          action: r.action,
          payload: pickActivityPayload(r.payload),
          createdAt: r.createdAt,
          actorName: r.actor?.members[0]?.displayName ?? null,
        })),
        nextCursor,
      };
    }),

  /**
   * Cross-group feed for mobile's Activity tab, which has no group in scope.
   * `list` answers "what happened in this group"; `feed` answers "what happened
   * in any group I can see", so each row carries its own group name and base
   * currency — a settlement line formats its amount in the currency of the group
   * it belongs to, and two groups in the feed rarely share one.
   */
  feed: protectedProcedure
    .input(
      z.object({
        groupId: z.string().optional(),
        action: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      // A named group still goes through the group-access check, so `feed` can
      // never be used to read a group `list` would have refused.
      if (input.groupId) await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);

      // Visibility rides as a *relation filter* rather than a pre-fetched id
      // list: Postgres resolves it as an EXISTS against the row being scanned,
      // so this stays one statement whether the user is in three groups or
      // three thousand. Fetching the ids first would have grown an unbounded
      // `IN (…)` and cost an extra round trip.
      const visibleGroup = input.groupId
        ? { id: input.groupId }
        : { OR: [{ createdById: ctx.user.id }, { members: { some: { userId: ctx.user.id } } }] };

      const rows = await ctx.prisma.activityLog.findMany({
        where: { action: input.action, group: visibleGroup },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor } } : {}),
        include: { group: { select: { name: true, baseCurrency: true } } },
      });

      const nextCursor = rows.length > input.limit ? (rows.pop()?.id ?? null) : null;

      // Actor names resolve per (user, group) — the same person is a
      // differently-named member in each group. Both id lists are bounded by
      // the page size, so this cannot fan out with group count.
      const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id) => id !== null))];
      const members = actorIds.length
        ? await ctx.prisma.member.findMany({
            where: {
              userId: { in: actorIds },
              groupId: { in: [...new Set(rows.map((r) => r.groupId))] },
            },
            select: { userId: true, groupId: true, displayName: true },
          })
        : [];
      const nameOf = new Map(members.map((m) => [`${m.userId}:${m.groupId}`, m.displayName]));

      return {
        items: rows.map((r) => ({
          id: r.id,
          action: r.action,
          payload: pickActivityPayload(r.payload),
          createdAt: r.createdAt,
          actorName: r.actorId ? (nameOf.get(`${r.actorId}:${r.groupId}`) ?? null) : null,
          groupId: r.groupId,
          groupName: r.group.name,
          baseCurrency: r.group.baseCurrency,
        })),
        nextCursor,
      };
    }),
});
