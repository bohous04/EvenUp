/** Member management (PRD §4.2). */
import { z } from 'zod';
import { deriveInitials, colorForIndex, isValidIban, normalizeIban } from '@evenup/core';
import type { PrismaClient } from '@evenup/db';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { addMemberInput, setBankDetailInput, memberRole } from '../schemas.js';
import { assertGroupAccess } from '../access.js';
import { logActivity } from '../services/activity.js';

async function groupIdForMember(ctx: { prisma: PrismaClient }, memberId: string) {
  const member = await ctx.prisma.member.findUnique({
    where: { id: memberId },
    select: { groupId: true },
  });
  if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
  return member.groupId;
}

export const memberRouter = router({
  add: protectedProcedure.input(addMemberInput).mutation(async ({ ctx, input }) => {
    await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
    const count = await ctx.prisma.member.count({ where: { groupId: input.groupId } });
    const member = await ctx.prisma.member.create({
      data: {
        groupId: input.groupId,
        displayName: input.displayName,
        initials: deriveInitials(input.displayName),
        color: input.color ?? colorForIndex(count),
        defaultShare: input.defaultShare,
        role: input.role,
      },
    });
    await logActivity(ctx.prisma, input.groupId, ctx.user.id, 'member.added', {
      name: member.displayName,
    });
    return member;
  }),

  list: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      return ctx.prisma.member.findMany({
        where: { groupId: input.groupId },
        orderBy: { createdAt: 'asc' },
        include: { bankDetail: { select: { recipientName: true, variableSymbol: true } } },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        memberId: z.string(),
        displayName: z.string().trim().min(1).max(80).optional(),
        defaultShare: z.number().int().min(1).max(1000).optional(),
        role: memberRole.optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const groupId = await groupIdForMember(ctx, input.memberId);
      await assertGroupAccess(ctx.prisma, ctx.user, groupId);
      const updated = await ctx.prisma.member.update({
        where: { id: input.memberId },
        data: {
          displayName: input.displayName,
          initials: input.displayName ? deriveInitials(input.displayName) : undefined,
          defaultShare: input.defaultShare,
          role: input.role,
          isActive: input.isActive,
        },
      });
      await logActivity(ctx.prisma, groupId, ctx.user.id, 'member.updated', {
        name: updated.displayName,
      });
      return updated;
    }),

  remove: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const groupId = await groupIdForMember(ctx, input.memberId);
      await assertGroupAccess(ctx.prisma, ctx.user, groupId);
      // Members that appear in any transaction are deactivated, not deleted (FR-2.4).
      const usage = await ctx.prisma.transactionSplit.count({
        where: { memberId: input.memberId },
      });
      const asPayer = await ctx.prisma.transactionPayer.count({
        where: { memberId: input.memberId },
      });
      if (usage > 0 || asPayer > 0) {
        return ctx.prisma.member.update({
          where: { id: input.memberId },
          data: { isActive: false },
        });
      }
      await ctx.prisma.member.delete({ where: { id: input.memberId } });
      return { deleted: true };
    }),

  setBankDetail: protectedProcedure.input(setBankDetailInput).mutation(async ({ ctx, input }) => {
    const groupId = await groupIdForMember(ctx, input.memberId);
    await assertGroupAccess(ctx.prisma, ctx.user, groupId);
    const iban = normalizeIban(input.iban);
    if (!isValidIban(iban)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid IBAN' });
    }
    const ibanEncrypted = ctx.secretBox.encrypt(iban);
    return ctx.prisma.bankDetail.upsert({
      where: { memberId: input.memberId },
      create: {
        memberId: input.memberId,
        ibanEncrypted,
        recipientName: input.recipientName,
        variableSymbol: input.variableSymbol,
      },
      update: {
        ibanEncrypted,
        recipientName: input.recipientName,
        variableSymbol: input.variableSymbol,
      },
      // Never return the encrypted IBAN to clients (§9.2).
      select: { id: true, memberId: true, recipientName: true, variableSymbol: true },
    });
  }),
});
