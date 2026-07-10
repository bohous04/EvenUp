/** User profile & settings, incl. BYO OpenRouter key (PRD §7.2, §6.2, FR-1.6). */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { deriveInitials, parseCzAccount, maskCzAccount } from '@evenup/core';
import { router, protectedProcedure } from '../trpc.js';
import { currencyCode } from '../schemas.js';
import { deleteUserAccount } from '../services/account.js';
import { logActivity } from '../services/activity.js';

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        locale: true,
        defaultCurrency: true,
        ocrModel: true,
        openRouterKeyEncrypted: true,
        bankAccountEncrypted: true,
        isAdmin: true,
        isVip: true,
        twoFactorEnabled: true,
      },
    });
    // Never expose the key or the raw account; just derived, non-sensitive facts.
    const { openRouterKeyEncrypted, bankAccountEncrypted, ...rest } = user;
    let bankAccountMasked: string | null = null;
    if (bankAccountEncrypted !== null) {
      try {
        const raw = ctx.secretBox.decrypt(bankAccountEncrypted);
        const masked = maskCzAccount(raw);
        // Fail closed: if masking couldn't parse the value (falls back to
        // echoing the input), never let the raw account reach the client.
        bankAccountMasked = masked !== raw ? masked : null;
      } catch {
        bankAccountMasked = null;
      }
    }
    return {
      ...rest,
      hasOpenRouterKey: openRouterKeyEncrypted !== null,
      bankAccountMasked,
    };
  }),

  updateSettings: protectedProcedure
    .input(
      z.object({
        locale: z.enum(['cs', 'en']).optional(),
        defaultCurrency: currencyCode.optional(),
        ocrModel: z.string().max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.user.update({ where: { id: ctx.user.id }, data: input });
      return { ok: true };
    }),

  /** Rename the account AND every group member linked to it (spec 2026-07-09 §4). */
  updateProfile: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const linked = await ctx.prisma.member.findMany({
        where: { userId: ctx.user.id },
        select: { id: true, groupId: true },
      });
      await ctx.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: ctx.user.id }, data: { name: input.name } });
        if (linked.length > 0) {
          await tx.member.updateMany({
            where: { userId: ctx.user.id },
            data: { displayName: input.name, initials: deriveInitials(input.name) },
          });
        }
        for (const groupId of new Set(linked.map((m) => m.groupId))) {
          await logActivity(tx, groupId, ctx.user.id, 'member.updated', { name: input.name });
        }
      });
      return { ok: true as const, membersRenamed: linked.length };
    }),

  /** Store the CZ bank account used for SPAYD QR in all groups (spec §4). */
  setBankAccount: protectedProcedure
    .input(z.object({ account: z.string().trim().max(30) }))
    .mutation(async ({ ctx, input }) => {
      const compact = input.account.replace(/\s+/g, '');
      if (!parseCzAccount(compact)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid account number' });
      }
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { bankAccountEncrypted: ctx.secretBox.encrypt(compact) },
      });
      return { ok: true as const, masked: maskCzAccount(compact) };
    }),

  clearBankAccount: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.user.update({
      where: { id: ctx.user.id },
      data: { bankAccountEncrypted: null },
    });
    return { ok: true as const };
  }),

  setOpenRouterKey: protectedProcedure
    .input(z.object({ apiKey: z.string().trim().min(8).max(400) }))
    .mutation(async ({ ctx, input }) => {
      const openRouterKeyEncrypted = ctx.secretBox.encrypt(input.apiKey);
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { openRouterKeyEncrypted },
      });
      return { ok: true };
    }),

  clearOpenRouterKey: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.user.update({
      where: { id: ctx.user.id },
      data: { openRouterKeyEncrypted: null },
    });
    return { ok: true };
  }),

  /** GDPR export of the user's personal data (FR-1.6). */
  exportData: protectedProcedure.query(async ({ ctx }) => {
    const [profile, groups, bankDetails] = await Promise.all([
      ctx.prisma.user.findUniqueOrThrow({
        where: { id: ctx.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          locale: true,
          defaultCurrency: true,
          createdAt: true,
          bankAccountEncrypted: true,
        },
      }),
      ctx.prisma.group.findMany({
        where: {
          OR: [{ createdById: ctx.user.id }, { members: { some: { userId: ctx.user.id } } }],
        },
        include: {
          members: true,
          transactions: { include: { payers: true, splits: true } },
          receipts: {
            select: { id: true, merchant: true, detectedCurrency: true, createdAt: true },
          },
        },
      }),
      ctx.prisma.bankDetail.findMany({
        where: { member: { userId: ctx.user.id } },
        select: { memberId: true, recipientName: true, variableSymbol: true },
      }),
    ]);
    const { bankAccountEncrypted, ...profileRest } = profile;
    let bankAccount: string | null = null;
    if (bankAccountEncrypted !== null) {
      try {
        bankAccount = ctx.secretBox.decrypt(bankAccountEncrypted);
      } catch {
        bankAccount = null;
      }
    }
    return { profile: { ...profileRest, bankAccount }, groups, bankDetails };
  }),

  /** GDPR account deletion (FR-1.6): delete solo groups, unlink shared ones. */
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    await deleteUserAccount(ctx.prisma, ctx.user.id);
    return { ok: true as const };
  }),
});
