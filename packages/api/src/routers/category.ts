/** Per-group custom expense categories (spec 2026-07-09). */
import { z } from 'zod';
import { CUSTOM_CATEGORY_ICONS } from '@evenup/core';
import { TRPCError } from '@trpc/server';
import { Prisma, type PrismaClient } from '@evenup/db';
import { router, protectedProcedure } from '../trpc.js';
import { assertGroupAccess } from '../access.js';
import { logActivity } from '../services/activity.js';

const nameInput = z.string().trim().min(1).max(40);
const iconInput = z.string().refine((v) => CUSTOM_CATEGORY_ICONS.includes(v), {
  message: 'Unknown icon',
});

async function groupIdForCategory(prisma: PrismaClient, categoryId: string) {
  const category = await prisma.groupCategory.findUnique({
    where: { id: categoryId },
    select: { groupId: true, name: true },
  });
  if (!category) throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
  return category;
}

export const categoryRouter = router({
  list: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      return ctx.prisma.groupCategory.findMany({
        where: { groupId: input.groupId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, iconName: true },
      });
    }),

  create: protectedProcedure
    .input(z.object({ groupId: z.string(), name: nameInput, iconName: iconInput }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      const existing = await ctx.prisma.groupCategory.findUnique({
        where: { groupId_name: { groupId: input.groupId, name: input.name } },
      });
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Category name already exists' });
      }
      const created = await ctx.prisma.groupCategory.create({
        data: { groupId: input.groupId, name: input.name, iconName: input.iconName },
        select: { id: true, name: true, iconName: true },
      });
      await logActivity(ctx.prisma, input.groupId, ctx.user.id, 'category.created', {
        name: created.name,
      });
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        categoryId: z.string(),
        name: nameInput.optional(),
        iconName: iconInput.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { groupId } = await groupIdForCategory(ctx.prisma, input.categoryId);
      await assertGroupAccess(ctx.prisma, ctx.user, groupId);
      let updated;
      try {
        updated = await ctx.prisma.groupCategory.update({
          where: { id: input.categoryId },
          data: { name: input.name, iconName: input.iconName },
          select: { id: true, name: true, iconName: true },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new TRPCError({ code: 'CONFLICT', message: 'Category name already exists' });
        }
        throw err;
      }
      await logActivity(ctx.prisma, groupId, ctx.user.id, 'category.updated', {
        name: updated.name,
      });
      return updated;
    }),

  remove: protectedProcedure
    .input(z.object({ categoryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { groupId, name } = await groupIdForCategory(ctx.prisma, input.categoryId);
      await assertGroupAccess(ctx.prisma, ctx.user, groupId);
      await ctx.prisma.$transaction(async (tx) => {
        // Reassign, don't lose: the category's expenses land in built-in "other".
        await tx.transaction.updateMany({
          where: { groupId, category: `custom:${input.categoryId}` },
          data: { category: 'other' },
        });
        await tx.groupCategory.delete({ where: { id: input.categoryId } });
        await logActivity(tx, groupId, ctx.user.id, 'category.deleted', { name });
      });
      return { ok: true as const };
    }),
});
