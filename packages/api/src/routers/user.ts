/** User profile & settings, incl. BYO OpenRouter key (PRD §7.2, §6.2, FR-1.6). */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { currencyCode } from '../schemas.js';

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
      },
    });
    // Never expose the key; just whether one is configured.
    const { openRouterKeyEncrypted, ...rest } = user;
    return { ...rest, hasOpenRouterKey: openRouterKeyEncrypted !== null };
  }),

  updateSettings: protectedProcedure
    .input(
      z.object({
        locale: z.enum(['cs', 'en']).optional(),
        defaultCurrency: currencyCode.optional(),
        ocrModel: z.string().max(120).optional(),
        name: z.string().trim().max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.user.update({ where: { id: ctx.user.id }, data: input });
      return { ok: true };
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
        select: { id: true, email: true, name: true, locale: true, defaultCurrency: true, createdAt: true },
      }),
      ctx.prisma.group.findMany({
        where: { OR: [{ createdById: ctx.user.id }, { members: { some: { userId: ctx.user.id } } }] },
        include: {
          members: true,
          transactions: { include: { payers: true, splits: true } },
          receipts: { select: { id: true, merchant: true, detectedCurrency: true, createdAt: true } },
        },
      }),
      ctx.prisma.bankDetail.findMany({
        where: { member: { userId: ctx.user.id } },
        select: { memberId: true, recipientName: true, variableSymbol: true },
      }),
    ]);
    return { profile, groups, bankDetails };
  }),

  /** GDPR account deletion (FR-1.6): delete solo groups, unlink shared ones. */
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    await ctx.prisma.$transaction(async (tx) => {
      const memberships = await tx.member.findMany({ where: { userId }, select: { id: true, groupId: true } });
      const groupIds = [...new Set(memberships.map((m) => m.groupId))];
      for (const groupId of groupIds) {
        // "Other linked members" = members with a different account. Explicit
        // not-null AND not-self to avoid Prisma null-handling ambiguity.
        const others = await tx.member.count({
          where: { groupId, AND: [{ userId: { not: null } }, { userId: { not: userId } }] },
        });
        if (others === 0) {
          await tx.group.delete({ where: { id: groupId } }); // solo -> cascade delete
          continue;
        }
        for (const m of memberships.filter((mm) => mm.groupId === groupId)) {
          await tx.bankDetail.deleteMany({ where: { memberId: m.id } }); // PII
          const used =
            (await tx.transactionSplit.count({ where: { memberId: m.id } })) +
            (await tx.transactionPayer.count({ where: { memberId: m.id } })) +
            // Defensive: also count transfer endpoints. Today recordTransfer already
            // creates a payer/split row for both sides, so this doesn't change
            // behavior yet -- it guards against a future refactor decoupling
            // transfers from payer/split rows.
            (await tx.transaction.count({
              where: { OR: [{ fromMemberId: m.id }, { toMemberId: m.id }] },
            }));
          if (used > 0) {
            await tx.member.update({ where: { id: m.id }, data: { isActive: false, userId: null } });
          } else {
            await tx.member.delete({ where: { id: m.id } });
          }
        }
      }
      // Sessions + accounts cascade on user delete (schema onDelete: Cascade).
      await tx.user.delete({ where: { id: userId } });
    });
    return { ok: true as const };
  }),
});
