/** Expenses, income, and transfers (PRD §4.3, §4.7). */
import { z } from 'zod';
import { Prisma } from '@evenup/db';
import { fromMinor } from '@evenup/db';
import {
  dueOccurrences,
  RECURRENCE_INTERVALS,
  type RecurrenceInterval,
  parseExpensesCsv,
  splitEqually,
  isExpenseCategory,
} from '@evenup/core';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { createExpenseInput, recordTransferInput } from '../schemas.js';
import { assertGroupAccess } from '../access.js';
import { planExpense } from '../services/transaction-service.js';
import { resolveRateDecimal, convertToBase } from '../services/fx-service.js';
import { logActivity } from '../services/activity.js';
import type { Context } from '../context.js';

const transactionInclude = {
  payers: { include: { member: true } },
  splits: { include: { member: true } },
} satisfies Prisma.TransactionInclude;

/** Pass the injected FX fetch (tests only) so createExpense/recordTransfer can auto-fetch a missing rate. */
function fxArgs(ctx: Context) {
  return ctx.fxFetch
    ? { fetchImpl: ctx.fxFetch, providerUrl: process.env.FX_PROVIDER_URL ?? 'https://api.frankfurter.app' }
    : undefined;
}

export const transactionRouter = router({
  createExpense: protectedProcedure.input(createExpenseInput).mutation(async ({ ctx, input }) => {
    await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
    const group = await ctx.prisma.group.findUniqueOrThrow({ where: { id: input.groupId } });

    const plan = planExpense(input);
    const { rateDecimal, overridden } = await resolveRateDecimal(
      ctx.prisma,
      input.currency,
      group.baseCurrency,
      input.date,
      input.exchangeRateToBase,
      group.fxLockedRate,
      fxArgs(ctx),
    );
    const sign = input.type === 'INCOME' ? -1 : 1;
    const baseTotal =
      sign * convertToBase(plan.totalMinorUnits, input.currency, group.baseCurrency, rateDecimal);

    const transaction = await ctx.prisma.transaction.create({
      data: {
        groupId: input.groupId,
        type: input.type,
        title: input.title,
        note: input.note,
        currency: input.currency,
        totalMinorUnits: fromMinor(sign * plan.totalMinorUnits),
        baseMinorUnits: fromMinor(baseTotal),
        exchangeRateToBase: new Prisma.Decimal(rateDecimal),
        fxRateOverridden: overridden,
        date: input.date,
        category: input.category,
        splitType: plan.splitType,
        createdById: ctx.user.id,
        receiptId: input.receiptId,
        payers: {
          create: input.payers.map((p) => ({
            memberId: p.memberId,
            amountMinorUnits: fromMinor(sign * p.amountMinorUnits),
          })),
        },
        splits: {
          create: plan.shares.map((s) => ({
            memberId: s.memberId,
            computedMinorUnits: fromMinor(sign * s.computedMinorUnits),
          })),
        },
      },
      include: transactionInclude,
    });
    await logActivity(ctx.prisma, input.groupId, ctx.user.id, 'expense.created', {
      title: input.title,
    });
    return transaction;
  }),

  recordTransfer: protectedProcedure.input(recordTransferInput).mutation(async ({ ctx, input }) => {
    await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
    const group = await ctx.prisma.group.findUniqueOrThrow({ where: { id: input.groupId } });
    const date = input.date ?? new Date();
    const { rateDecimal } = await resolveRateDecimal(
      ctx.prisma,
      input.currency,
      group.baseCurrency,
      date,
      undefined,
      undefined,
      fxArgs(ctx),
    );
    const baseAmount = convertToBase(
      input.amountMinorUnits,
      input.currency,
      group.baseCurrency,
      rateDecimal,
    );

    const transaction = await ctx.prisma.transaction.create({
      data: {
        groupId: input.groupId,
        type: 'TRANSFER',
        title: input.note ?? 'Settlement',
        currency: input.currency,
        totalMinorUnits: fromMinor(input.amountMinorUnits),
        baseMinorUnits: fromMinor(baseAmount),
        exchangeRateToBase: new Prisma.Decimal(rateDecimal),
        date,
        splitType: 'EXACT',
        createdById: ctx.user.id,
        fromMemberId: input.fromMemberId,
        toMemberId: input.toMemberId,
        method: input.method,
        settledAt: date,
        payers: {
          create: [
            { memberId: input.fromMemberId, amountMinorUnits: fromMinor(input.amountMinorUnits) },
          ],
        },
        splits: {
          create: [
            { memberId: input.toMemberId, computedMinorUnits: fromMinor(input.amountMinorUnits) },
          ],
        },
      },
      include: transactionInclude,
    });
    await logActivity(ctx.prisma, input.groupId, ctx.user.id, 'settlement.recorded', {
      amount: input.amountMinorUnits,
      method: input.method,
    });
    return transaction;
  }),

  list: protectedProcedure
    .input(z.object({ groupId: z.string(), limit: z.number().int().min(1).max(200).default(100) }))
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      return ctx.prisma.transaction.findMany({
        where: { groupId: input.groupId },
        orderBy: { date: 'desc' },
        take: input.limit,
        include: transactionInclude,
      });
    }),

  /** Mark an expense as a recurring template, or clear recurrence (FR-12.1). */
  setRecurrence: protectedProcedure
    .input(
      z.object({
        transactionId: z.string(),
        interval: z.enum(RECURRENCE_INTERVALS).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const txn = await ctx.prisma.transaction.findUniqueOrThrow({
        where: { id: input.transactionId },
        select: { groupId: true, date: true },
      });
      await assertGroupAccess(ctx.prisma, ctx.user, txn.groupId);
      return ctx.prisma.transaction.update({
        where: { id: input.transactionId },
        data: {
          recurrenceInterval: input.interval,
          // Anchor the cursor at the template's date so the next run generates
          // every occurrence since then.
          recurrenceLastRun: input.interval ? txn.date : null,
        },
      });
    }),

  /** Materialize all due occurrences of the group's recurring templates. */
  materializeDue: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      const templates = await ctx.prisma.transaction.findMany({
        where: { groupId: input.groupId, recurrenceInterval: { not: null } },
        include: { payers: true, splits: true },
      });
      const now = new Date();
      let created = 0;

      for (const tmpl of templates) {
        const due = dueOccurrences({
          anchor: tmpl.date,
          interval: tmpl.recurrenceInterval as RecurrenceInterval,
          lastRun: tmpl.recurrenceLastRun,
          now,
        });
        for (const date of due) {
          await ctx.prisma.transaction.create({
            data: {
              groupId: tmpl.groupId,
              type: tmpl.type,
              title: tmpl.title,
              note: tmpl.note,
              currency: tmpl.currency,
              totalMinorUnits: tmpl.totalMinorUnits,
              baseMinorUnits: tmpl.baseMinorUnits,
              exchangeRateToBase: tmpl.exchangeRateToBase,
              date,
              category: tmpl.category,
              splitType: tmpl.splitType,
              createdById: tmpl.createdById,
              recurringFromId: tmpl.id,
              payers: {
                create: tmpl.payers.map((p) => ({
                  memberId: p.memberId,
                  amountMinorUnits: p.amountMinorUnits,
                })),
              },
              splits: {
                create: tmpl.splits.map((s) => ({
                  memberId: s.memberId,
                  shareWeight: s.shareWeight,
                  exactMinorUnits: s.exactMinorUnits,
                  percentage: s.percentage,
                  computedMinorUnits: s.computedMinorUnits,
                })),
              },
            },
          });
          created++;
        }
        const last = due[due.length - 1];
        if (last) {
          await ctx.prisma.transaction.update({
            where: { id: tmpl.id },
            data: { recurrenceLastRun: last },
          });
        }
      }
      return { created };
    }),

  /** Import expenses from a CSV export (Phase 4). Equal split among all members. */
  importCsv: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        csv: z.string().min(1).max(1_000_000),
        payerMemberId: z.string(),
        delimiter: z.string().length(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      const group = await ctx.prisma.group.findUniqueOrThrow({
        where: { id: input.groupId },
        include: { members: { where: { isActive: true } } },
      });
      if (group.members.length === 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Add members before importing',
        });
      }
      if (!group.members.some((m) => m.id === input.payerMemberId)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Payer is not a group member' });
      }

      let parsed;
      try {
        parsed = parseExpensesCsv(input.csv, {
          defaultCurrency: group.baseCurrency,
          delimiter: input.delimiter,
        });
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : 'Invalid CSV',
        });
      }

      const beneficiaries = group.members.map((m) => ({ memberId: m.id }));
      let created = 0;
      let skipped = 0;

      for (const row of parsed.rows) {
        // Only base-currency rows are imported directly (others need an FX rate).
        if (row.currency !== group.baseCurrency) {
          skipped++;
          continue;
        }
        const shares = splitEqually(row.amountMinorUnits, beneficiaries);
        await ctx.prisma.transaction.create({
          data: {
            groupId: input.groupId,
            type: 'EXPENSE',
            title: row.title,
            currency: row.currency,
            totalMinorUnits: fromMinor(row.amountMinorUnits),
            baseMinorUnits: fromMinor(row.amountMinorUnits),
            date: new Date(`${row.date}T00:00:00Z`),
            category: row.category && isExpenseCategory(row.category) ? row.category : null,
            splitType: 'EQUAL',
            createdById: ctx.user.id,
            payers: {
              create: [
                {
                  memberId: input.payerMemberId,
                  amountMinorUnits: fromMinor(row.amountMinorUnits),
                },
              ],
            },
            splits: {
              create: shares.map((s) => ({
                memberId: s.memberId,
                computedMinorUnits: fromMinor(s.computedMinorUnits),
              })),
            },
          },
        });
        created++;
      }

      await logActivity(ctx.prisma, input.groupId, ctx.user.id, 'expenses.imported', { created });
      return { created, skipped, errors: parsed.errors };
    }),

  delete: protectedProcedure
    .input(z.object({ transactionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const txn = await ctx.prisma.transaction.findUniqueOrThrow({
        where: { id: input.transactionId },
        select: { groupId: true, title: true },
      });
      await assertGroupAccess(ctx.prisma, ctx.user, txn.groupId);
      await ctx.prisma.transaction.delete({ where: { id: input.transactionId } });
      await logActivity(ctx.prisma, txn.groupId, ctx.user.id, 'transaction.deleted', {
        title: txn.title,
      });
      return { deleted: true };
    }),
});
