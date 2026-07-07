/** Invite links: create, preview, and claim a member (PRD §4.2, FR-1.3, FR-2.5). */
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { deriveInitials, colorForIndex } from '@evenup/core';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, publicProcedure } from '../trpc.js';
import { assertGroupAdmin } from '../access.js';

export const inviteRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        expiresInDays: z.number().int().min(1).max(365).optional(),
        maxUses: z.number().int().min(1).max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertGroupAdmin(ctx.prisma, ctx.user, input.groupId);
      const token = randomBytes(18).toString('base64url');
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86_400_000)
        : null;
      return ctx.prisma.invite.create({
        data: {
          groupId: input.groupId,
          token,
          createdById: ctx.user.id,
          expiresAt,
          maxUses: input.maxUses,
        },
      });
    }),

  /** Public preview so a participant can see the group before claiming. */
  preview: publicProcedure.input(z.object({ token: z.string() })).query(async ({ ctx, input }) => {
    const invite = await ctx.prisma.invite.findUnique({
      where: { token: input.token },
      include: { group: { include: { members: true } } },
    });
    if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Invite expired' });
    }
    return {
      groupName: invite.group.name,
      members: invite.group.members
        .filter((m) => m.userId === null && m.isActive)
        .map((m) => ({
          id: m.id,
          displayName: m.displayName,
          initials: m.initials,
          color: m.color,
        })),
    };
  }),

  /** Claim an existing virtual member, or join as a new member. */
  claim: protectedProcedure
    .input(
      z.object({
        token: z.string(),
        memberId: z.string().optional(),
        displayName: z.string().trim().min(1).max(80).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.prisma.invite.findUnique({
        where: { token: input.token },
        include: { group: true },
      });
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Invite expired' });
      }
      if (invite.maxUses && invite.usedCount >= invite.maxUses) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Invite usage limit reached' });
      }

      const member = await ctx.prisma.$transaction(async (tx) => {
        let claimed;
        if (input.memberId) {
          const target = await tx.member.findFirst({
            where: { id: input.memberId, groupId: invite.groupId },
          });
          if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
          if (target.userId && target.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'CONFLICT', message: 'Member already claimed' });
          }
          claimed = await tx.member.update({
            where: { id: target.id },
            data: { userId: ctx.user.id },
          });
        } else {
          const count = await tx.member.count({ where: { groupId: invite.groupId } });
          const name = input.displayName ?? ctx.user.email.split('@')[0] ?? 'Guest';
          claimed = await tx.member.create({
            data: {
              groupId: invite.groupId,
              displayName: name,
              initials: deriveInitials(name),
              color: colorForIndex(count),
              userId: ctx.user.id,
            },
          });
        }
        await tx.invite.update({
          where: { id: invite.id },
          data: { usedCount: { increment: 1 } },
        });
        return claimed;
      });

      return member;
    }),
});
