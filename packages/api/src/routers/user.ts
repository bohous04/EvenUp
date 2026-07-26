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
        image: true,
        locale: true,
        defaultCurrency: true,
        ocrModel: true,
        hideProfilePhoto: true,
        openRouterKeyEncrypted: true,
        bankAccountEncrypted: true,
        isAdmin: true,
        isVip: true,
        twoFactorEnabled: true,
      },
    });
    // Expose only derived, non-sensitive facts here — `me` is fetched on many
    // pages (header, OCR, admin). The OpenRouter key and the plaintext bank
    // account (PII) never ride this hot, widely-cached query; the full account
    // lives behind the dedicated, settings-only `getBankAccount` below.
    const { openRouterKeyEncrypted, bankAccountEncrypted, ...rest } = user;
    return {
      ...rest,
      hasOpenRouterKey: openRouterKeyEncrypted !== null,
      hasBankAccount: bankAccountEncrypted !== null,
    };
  }),

  /**
   * The owner's own stored bank account, in full. Kept off `me` so the plaintext
   * PII is only fetched/cached on the settings screen that actually displays it.
   * Owner-scoped; decryption fails closed (null).
   */
  getBankAccount: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { bankAccountEncrypted: true },
    });
    if (user.bankAccountEncrypted === null) return { account: null };
    try {
      return { account: ctx.secretBox.decrypt(user.bankAccountEncrypted) };
    } catch {
      return { account: null };
    }
  }),

  updateSettings: protectedProcedure
    .input(
      z.object({
        locale: z.enum(['cs', 'en']).optional(),
        defaultCurrency: currencyCode.optional(),
        ocrModel: z.string().max(120).optional(),
        hideProfilePhoto: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.user.update({ where: { id: ctx.user.id }, data: input });
      return { ok: true };
    }),

  /**
   * Rename the account AND every group member linked to it (spec 2026-07-09
   * §4). Scoped to *active* links only: a deactivated row is a removed
   * membership (see access.ts), so a former member must not be able to keep
   * rewriting their old row's display name or injecting activity entries
   * into a group they no longer belong to.
   */
  updateProfile: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const linked = await ctx.prisma.member.findMany({
        where: { userId: ctx.user.id, isActive: true },
        select: { id: true, groupId: true },
      });
      await ctx.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: ctx.user.id }, data: { name: input.name } });
        if (linked.length > 0) {
          await tx.member.updateMany({
            where: { userId: ctx.user.id, isActive: true },
            data: { displayName: input.name, initials: deriveInitials(input.name) },
          });
        }
        for (const groupId of new Set(linked.map((m) => m.groupId))) {
          await logActivity(tx, groupId, ctx.user.id, 'member.updated', { name: input.name });
        }
      });
      return { ok: true as const, membersRenamed: linked.length };
    }),

  /**
   * Set the user's profile picture, stored as a (client-downscaled) image data
   * URL in `User.image` — the same field OAuth providers populate with a photo
   * URL, so it renders identically wherever a member's chip appears. Bounded in
   * size to keep it out of the way in the member queries that carry it.
   */
  setAvatar: protectedProcedure
    .input(z.object({ image: z.string().startsWith('data:image/').max(300_000) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { image: input.image },
      });
      return { ok: true as const };
    }),

  /** Remove the profile picture, falling back to the monogram everywhere. */
  clearAvatar: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.user.update({ where: { id: ctx.user.id }, data: { image: null } });
    return { ok: true as const };
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

  /**
   * GDPR export of the user's personal data (FR-1.6).
   *
   * Groups fall into two buckets by the caller's *current* link, mirroring
   * the access.ts contract: a deactivated member row is a removed person and
   * must not read as ongoing group access (see access.ts).
   *  - Creator, or an active member -> the whole group, unchanged from before.
   *  - Only a deactivated (removed) link left -> not "their own data" in
   *    full: the group's identity, plus only the transactions their member
   *    row actually took part in (as payer or split), and only the members
   *    and receipts those transactions reference. Without this, export
   *    became a way for a removed member to keep reading the group's live
   *    ledger indefinitely -- everything added after they left included.
   */
  exportData: protectedProcedure.query(async ({ ctx }) => {
    const receiptSelect = {
      id: true,
      merchant: true,
      detectedCurrency: true,
      createdAt: true,
    } as const;

    const [profile, fullAccessGroups, bankDetails] = await Promise.all([
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
          OR: [
            { createdById: ctx.user.id },
            { members: { some: { userId: ctx.user.id, isActive: true } } },
          ],
        },
        include: {
          members: true,
          transactions: { include: { payers: true, splits: true } },
          receipts: { select: receiptSelect },
        },
      }),
      ctx.prisma.bankDetail.findMany({
        where: { member: { userId: ctx.user.id } },
        select: { memberId: true, recipientName: true, variableSymbol: true },
      }),
    ]);

    const fullAccessIds = new Set(fullAccessGroups.map((g) => g.id));
    const inactiveLinkGroups = await ctx.prisma.group.findMany({
      where: {
        id: { notIn: [...fullAccessIds] },
        members: { some: { userId: ctx.user.id, isActive: false } },
      },
      include: {
        members: true,
        // Only the transactions the caller's own (now-inactive) member row
        // participated in -- not the group's transactions in general.
        transactions: {
          where: {
            OR: [
              { payers: { some: { member: { userId: ctx.user.id } } } },
              { splits: { some: { member: { userId: ctx.user.id } } } },
            ],
          },
          include: { payers: true, splits: true },
        },
        receipts: { select: receiptSelect },
      },
    });

    const restrictedGroups = inactiveLinkGroups.map((group) => {
      // Always keep the caller's own member row(s) -- that's their data
      // regardless of whether they ever took part in a transaction -- plus
      // whoever co-appears in a transaction they actually participated in.
      const participantMemberIds = new Set(
        group.members.filter((m) => m.userId === ctx.user.id).map((m) => m.id),
      );
      const linkedReceiptIds = new Set<string>();
      for (const t of group.transactions) {
        for (const p of t.payers) participantMemberIds.add(p.memberId);
        for (const s of t.splits) participantMemberIds.add(s.memberId);
        if (t.receiptId) linkedReceiptIds.add(t.receiptId);
      }
      return {
        ...group,
        members: group.members.filter((m) => participantMemberIds.has(m.id)),
        receipts: group.receipts.filter((r) => linkedReceiptIds.has(r.id)),
      };
    });

    const groups = [...fullAccessGroups, ...restrictedGroups];
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
