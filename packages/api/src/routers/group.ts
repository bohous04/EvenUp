/** Group CRUD (PRD §4.2). */
import { z } from 'zod';
import { deriveInitials, colorForIndex } from '@evenup/core';
import { router, protectedProcedure } from '../trpc.js';
import { createGroupInput, updateGroupInput } from '../schemas.js';
import { assertGroupAccess, assertGroupAdmin } from '../access.js';
import { logActivity } from '../services/activity.js';

export const groupRouter = router({
  create: protectedProcedure.input(createGroupInput).mutation(async ({ ctx, input }) => {
    // Prefer the name entered at sign-up; fall back to the email local-part.
    const displayName = ctx.user.name?.trim() || ctx.user.email.split('@')[0] || 'Admin';
    const group = await ctx.prisma.group.create({
      data: {
        name: input.name,
        template: input.template,
        baseCurrency: input.baseCurrency,
        simplifyDebts: input.simplifyDebts,
        createdById: ctx.user.id,
        // The creator joins as the first ADMIN member (FR-2.6).
        members: {
          create: {
            displayName,
            initials: deriveInitials(displayName),
            color: colorForIndex(0),
            role: 'ADMIN',
            userId: ctx.user.id,
          },
        },
      },
      include: { members: true },
    });
    await logActivity(ctx.prisma, group.id, ctx.user.id, 'group.created', { name: group.name });
    return group;
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.group.findMany({
      where: {
        OR: [{ createdById: ctx.user.id }, { members: { some: { userId: ctx.user.id } } }],
      },
      orderBy: { createdAt: 'desc' },
      include: { members: true, _count: { select: { transactions: true } } },
    });
  }),

  get: protectedProcedure.input(z.object({ groupId: z.string() })).query(async ({ ctx, input }) => {
    await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
    return ctx.prisma.group.findUniqueOrThrow({
      where: { id: input.groupId },
      include: { members: { orderBy: { createdAt: 'asc' } } },
    });
  }),

  update: protectedProcedure.input(updateGroupInput).mutation(async ({ ctx, input }) => {
    await assertGroupAdmin(ctx.prisma, ctx.user, input.groupId);
    const updated = await ctx.prisma.group.update({
      where: { id: input.groupId },
      data: { name: input.name, simplifyDebts: input.simplifyDebts },
    });
    await logActivity(ctx.prisma, input.groupId, ctx.user.id, 'group.updated', {
      name: updated.name,
    });
    return updated;
  }),

  archive: protectedProcedure
    .input(z.object({ groupId: z.string(), archived: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupAdmin(ctx.prisma, ctx.user, input.groupId);
      const updated = await ctx.prisma.group.update({
        where: { id: input.groupId },
        data: { archivedAt: input.archived ? new Date() : null },
      });
      await logActivity(
        ctx.prisma,
        input.groupId,
        ctx.user.id,
        input.archived ? 'group.archived' : 'group.restored',
        { name: updated.name },
      );
      return updated;
    }),
});
