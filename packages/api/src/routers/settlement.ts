/** SPAYD QR generation + mark-as-paid (PRD §4.7). */
import { z } from 'zod';
import { buildSpayd } from '@evenup/core';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { currencyCode, positiveMinorUnits } from '../schemas.js';
import { assertGroupAccess } from '../access.js';
import { resolvePayee } from '../services/payee.js';

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

      const payee = resolvePayee(member, ctx.secretBox, input.variableSymbol);
      if (!payee) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Recipient has no saved IBAN; settle in cash or manually (FR-7.4).',
        });
      }
      const spayd = buildSpayd({
        iban: payee.iban,
        amountMinorUnits: input.amountMinorUnits,
        currency: input.currency,
        message: input.message,
        recipientName: payee.recipientName,
        variableSymbol: payee.variableSymbol,
      });
      return { spayd };
    }),
});
