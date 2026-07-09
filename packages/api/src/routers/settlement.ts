/** SPAYD QR generation + mark-as-paid (PRD §4.7). */
import { z } from 'zod';
import { buildSpayd, czAccountToIban } from '@evenup/core';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { currencyCode, positiveMinorUnits } from '../schemas.js';
import { assertGroupAccess } from '../access.js';

export const settlementRouter = router({
  /** Build a SPAYD string for paying a creditor who has a saved IBAN (FR-7.1). */
  generateSpayd: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        toMemberId: z.string(),
        amountMinorUnits: positiveMinorUnits,
        currency: currencyCode,
        message: z.string().max(60).optional(),
        variableSymbol: z
          .string()
          .regex(/^\d{1,10}$/)
          .optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      const member = await ctx.prisma.member.findFirst({
        where: { id: input.toMemberId, groupId: input.groupId },
        include: {
          bankDetail: true,
          user: { select: { name: true, bankAccountEncrypted: true } },
        },
      });
      if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });

      // Payee resolution (spec 2026-07-09 §4): the linked user's account-level
      // CZ bank account wins; legacy per-member BankDetail stays as fallback.
      let iban: string | null = null;
      let recipientName = member.displayName;
      let variableSymbol = input.variableSymbol;
      if (member.user?.bankAccountEncrypted) {
        iban = czAccountToIban(ctx.secretBox.decrypt(member.user.bankAccountEncrypted));
        recipientName = member.user.name ?? member.displayName;
      }
      if (!iban && member.bankDetail) {
        iban = ctx.secretBox.decrypt(member.bankDetail.ibanEncrypted);
        recipientName = member.bankDetail.recipientName ?? member.displayName;
        variableSymbol = member.bankDetail.variableSymbol ?? input.variableSymbol;
      }
      if (!iban) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Recipient has no saved IBAN; settle in cash or manually (FR-7.4).',
        });
      }
      const spayd = buildSpayd({
        iban,
        amountMinorUnits: input.amountMinorUnits,
        currency: input.currency,
        message: input.message,
        recipientName,
        variableSymbol,
      });
      return { spayd };
    }),
});
