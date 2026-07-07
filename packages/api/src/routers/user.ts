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

  /** GDPR export of the user's groups & transactions (FR-1.6). */
  exportData: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.group.findMany({
      where: { OR: [{ createdById: ctx.user.id }, { members: { some: { userId: ctx.user.id } } }] },
      include: { members: true, transactions: { include: { payers: true, splits: true } } },
    });
  }),
});
