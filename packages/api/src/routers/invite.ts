/** Invite links: create, preview, and claim a member (PRD §4.2, FR-1.3, FR-2.5). */
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { deriveInitials, colorForIndex } from '@evenup/core';
import type { PrismaClient, Prisma } from '@evenup/db';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, publicProcedure } from '../trpc.js';
import { assertGroupAdmin } from '../access.js';
import { logActivity } from '../services/activity.js';
import { getGroupBalances } from '../services/balance-service.js';

/**
 * The viewer's own member in this group, if any -- active or not.
 *
 * No `isActive` filter, deliberately: `member.update`/`member.remove` let any
 * group member (not just an admin) deactivate a member, including their own.
 * Filtering to `isActive: true` here let an attacker deactivate themselves
 * immediately before claiming, make the guard below see no membership at
 * all, and hijack a different member's identity and balances -- then
 * reactivate themselves afterwards to hold two active rows. Matching on
 * `{ groupId, userId }` alone closes that: a deactivated row still counts as
 * "the caller already has a row here", so `invite.claim` can reactivate it
 * in place instead of pretending it doesn't exist.
 */
function findOwnMembership(
  db: PrismaClient | Prisma.TransactionClient,
  groupId: string,
  userId: string,
) {
  return db.member.findFirst({ where: { groupId, userId } });
}

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

  /**
   * The signed-in invitee's claim list: the same unclaimed members `preview`
   * returns, plus each one's balance so the invitee recognises their own row.
   *
   * Deliberately NOT folded into `preview`: that one is public, and attaching
   * balances there would expose the group's debts to anyone holding the token
   * before they ever sign in.
   */
  claimOptions: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const invite = await ctx.prisma.invite.findUnique({
        where: { token: input.token },
        include: { group: { include: { members: true } } },
      });
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Invite expired' });
      }

      const own = await findOwnMembership(ctx.prisma, invite.groupId, ctx.user.id);
      // Only an ACTIVE membership redirects into the group. A deactivated
      // ex-member must reach the claim page instead: their own row is filtered
      // out of the picker below (`userId !== null`), so they naturally land on
      // "I'm not on the list", which `invite.claim` now recognises and
      // reactivates in place rather than treating as a new join.
      if (own?.isActive) {
        // Nothing to pick — the page redirects into the group. Skip the balance
        // query entirely rather than computing a list nobody will see.
        return {
          groupId: invite.groupId,
          alreadyMember: true,
          groupName: invite.group.name,
          baseCurrency: invite.group.baseCurrency,
          members: [] as {
            id: string;
            displayName: string;
            initials: string;
            color: string;
            balanceMinorUnits: number;
          }[],
        };
      }

      const { balances } = await getGroupBalances(ctx.prisma, invite.groupId, invite.group);
      const balanceById = new Map(balances.map((b) => [b.memberId, b.balanceMinorUnits]));

      return {
        groupId: invite.groupId,
        alreadyMember: false,
        groupName: invite.group.name,
        baseCurrency: invite.group.baseCurrency,
        members: invite.group.members
          .filter((m) => m.userId === null && m.isActive)
          .map((m) => ({
            id: m.id,
            displayName: m.displayName,
            initials: m.initials,
            color: m.color,
            balanceMinorUnits: balanceById.get(m.id) ?? 0,
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

      const { member, joined } = await ctx.prisma.$transaction(async (tx) => {
        const own = await findOwnMembership(tx, invite.groupId, ctx.user.id);

        if (own?.isActive) {
          // Re-claiming the member you already hold is a retried request, not a
          // second join: no usage bump, no duplicate activity entry -- and (see
          // the usage-limit check below, which deliberately runs AFTER this)
          // no usage-limit refusal either, so a retry still no-ops even once
          // the invite is exhausted.
          if (input.memberId === own.id) return { member: own, joined: false };
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'You are already a member of this group',
          });
        }

        // Checked here, not before the transaction: every path below this
        // point is a genuine state change (reactivate, claim, or create), so
        // the usage limit should apply to all of them -- but the idempotent
        // no-op above must never be able to fail on it, since the whole point
        // of that branch is that a retry after the invite is used up still
        // succeeds.
        if (invite.maxUses && invite.usedCount >= invite.maxUses) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Invite usage limit reached',
          });
        }

        if (own) {
          // `own` exists but is deactivated: the caller was removed from this
          // group (member.remove/member.update deactivate rather than delete,
          // FR-2.4) and is coming back. Reactivate THEIR OWN row in place
          // rather than creating a fresh one, so they land back with their
          // original history and debts attached instead of a stranded orphan
          // placeholder -- exactly the duplicate-member problem the
          // member-merge feature exists to clean up (see
          // docs/superpowers/specs/2026-07-25-duplicate-member-merge-design.md).
          // A `memberId` naming a DIFFERENT member is refused: the caller
          // already has a row in this group and must not take over someone
          // else's identity and balances by claiming a different one.
          if (input.memberId && input.memberId !== own.id) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'You are already a member of this group',
            });
          }
          const reactivated = await tx.member.update({
            where: { id: own.id },
            data: { isActive: true },
          });
          await tx.invite.update({
            where: { id: invite.id },
            data: { usedCount: { increment: 1 } },
          });
          return { member: reactivated, joined: true };
        }

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
          // Prefer the name entered at sign-up; fall back to the email local-part.
          const derivedName = ctx.user.name?.trim() || ctx.user.email.split('@')[0] || 'Guest';
          const name = input.displayName ?? derivedName;
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
        return { member: claimed, joined: true };
      });

      // Claiming an invite is the only way a Member ever gains a userId, and it
      // left no trace in the activity log (FR-9.1). The group's other members
      // learn about it in their next digest.
      if (joined) {
        await logActivity(ctx.prisma, invite.groupId, ctx.user.id, 'member.joined', {
          name: member.displayName,
        });
      }
      return member;
    }),
});
