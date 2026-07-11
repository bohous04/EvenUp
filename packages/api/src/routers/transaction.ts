/** Expenses, income, and transfers (PRD §4.3, §4.7). */
import { z } from 'zod';
import { Prisma, type PrismaClient } from '@evenup/db';
import { fromMinor } from '@evenup/db';
import {
  RECURRENCE_INTERVALS,
  parseExpensesCsv,
  splitEqually,
  isExpenseCategory,
  isCustomCategoryKey,
  type SplitShare,
} from '@evenup/core';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import {
  createExpenseInput,
  recordTransferInput,
  updateExpenseInput,
  updateTransferInput,
  type SplitConfig,
  type CreateExpenseInput,
} from '../schemas.js';
import { assertGroupAccess } from '../access.js';
import { planExpense } from '../services/transaction-service.js';
import { resolveRateDecimal, convertToBase } from '../services/fx-service.js';
import { logActivity } from '../services/activity.js';
import { materializeRecurring } from '../services/recurring-service.js';
import { notifySettlementRecorded } from '../services/notify.js';
import type { Context } from '../context.js';

const transactionInclude = {
  payers: { include: { member: true } },
  splits: { include: { member: true } },
  receipt: { select: { id: true, storageKeys: true } },
  receiptItems: { include: { assignments: true } },
} satisfies Prisma.TransactionInclude;

type FullTransaction = Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>;

/**
 * Surface whether a receipt image is available to view (FR-5.8/5.9) without
 * leaking the internal storageKeys (object-store paths) to the client, and hand
 * the client a plain-number `percentage` (a Prisma Decimal doesn't survive
 * superjson intact) so an edit can read back the original percentage split.
 */
function shapeTransaction(tx: FullTransaction) {
  const { receipt, splits, receiptItems, ...rest } = tx;
  return {
    ...rest,
    splits: splits.map((s) => ({
      ...s,
      percentage: s.percentage === null ? null : Number(s.percentage),
    })),
    receiptId: receipt?.id ?? null,
    hasReceiptImage: (receipt?.storageKeys.length ?? 0) > 0,
    receiptPageCount: receipt?.storageKeys.length ?? 0,
    items: receiptItems.map((ri) => ({
      name: ri.name,
      totalMinorUnits: Number(ri.totalMinorUnits),
      memberIds: ri.assignments.map((a) => a.memberId),
    })),
  };
}

/**
 * Reject any member id that isn't active-or-inactive *in this group* — blocks a
 * caller with access to one group from referencing a member of another group as
 * a payer/beneficiary/transfer endpoint (Prisma's FK only checks existence).
 */
async function assertMembersInGroup(
  prisma: PrismaClient,
  groupId: string,
  memberIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(memberIds)];
  if (ids.length === 0) return;
  const inGroup = await prisma.member.count({ where: { groupId, id: { in: ids } } });
  if (inGroup !== ids.length) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'A referenced member does not belong to this group',
    });
  }
}

/**
 * Build the split rows, persisting the RAW per-member input (weight / exact /
 * percentage) next to the computed amount so an edit can restore the exact split
 * — its type and ratios — rather than falling back to bare amounts.
 */
function splitCreateData(split: SplitConfig, shares: SplitShare[], sign: number) {
  const weight = new Map<string, number>();
  const exact = new Map<string, number>();
  const pct = new Map<string, number>();
  if (split.type === 'SHARES') for (const m of split.members) weight.set(m.memberId, m.weight);
  else if (split.type === 'PERCENTAGE')
    for (const m of split.members) pct.set(m.memberId, m.percentage);
  else if (split.type === 'EXACT')
    for (const m of split.members) exact.set(m.memberId, m.exactMinorUnits);
  else if (split.type === 'EQUAL')
    for (const m of split.members) if (m.weight != null) weight.set(m.memberId, m.weight);
  return shares.map((s) => ({
    memberId: s.memberId,
    computedMinorUnits: fromMinor(sign * s.computedMinorUnits),
    shareWeight: weight.get(s.memberId) ?? null,
    exactMinorUnits: exact.has(s.memberId) ? fromMinor(sign * exact.get(s.memberId)!) : null,
    percentage: pct.has(s.memberId) ? new Prisma.Decimal(pct.get(s.memberId)!) : null,
  }));
}

/** Nested `receiptItems` create for an ITEMIZED split — persists the item detail
 *  alongside the per-member splits (balances are unaffected). `undefined` for
 *  non-itemized splits so callers can drop items instead. */
function itemizedReceiptItemsCreate(split: CreateExpenseInput['split']) {
  if (split.type !== 'ITEMIZED') return undefined;
  return split.items.map((it) => ({
    name: it.name ?? '',
    totalMinorUnits: fromMinor(it.totalMinorUnits),
    assignments: { create: it.memberIds.map((memberId) => ({ memberId })) },
  }));
}

/** Pass the injected FX fetch (tests only) so createExpense/recordTransfer can auto-fetch a missing rate. */
function fxArgs(ctx: Context) {
  return ctx.fxFetch
    ? {
        fetchImpl: ctx.fxFetch,
        providerUrl: process.env.FX_PROVIDER_URL ?? 'https://api.frankfurter.app',
      }
    : undefined;
}

export const transactionRouter = router({
  createExpense: protectedProcedure.input(createExpenseInput).mutation(async ({ ctx, input }) => {
    await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
    const group = await ctx.prisma.group.findUniqueOrThrow({ where: { id: input.groupId } });

    if (input.category && isCustomCategoryKey(input.category)) {
      const exists = await ctx.prisma.groupCategory.findFirst({
        where: { id: input.category.slice('custom:'.length), groupId: input.groupId },
        select: { id: true },
      });
      if (!exists) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown category' });
      }
    }

    const plan = planExpense(input);
    await assertMembersInGroup(ctx.prisma, input.groupId, [
      ...input.payers.map((p) => p.memberId),
      ...plan.shares.map((s) => s.memberId),
    ]);
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
    const receiptItemsCreate = itemizedReceiptItemsCreate(input.split);

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
          create: splitCreateData(input.split, plan.shares, sign),
        },
        ...(receiptItemsCreate ? { receiptItems: { create: receiptItemsCreate } } : {}),
      },
      include: transactionInclude,
    });
    // `transactionId` lets the digest resolve "does this affect me" later, by
    // joining payers + splits, without fanning out recipients on this hot path.
    await logActivity(ctx.prisma, input.groupId, ctx.user.id, 'expense.created', {
      title: input.title,
      transactionId: transaction.id,
    });
    return shapeTransaction(transaction);
  }),

  recordTransfer: protectedProcedure.input(recordTransferInput).mutation(async ({ ctx, input }) => {
    await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
    const group = await ctx.prisma.group.findUniqueOrThrow({ where: { id: input.groupId } });
    await assertMembersInGroup(ctx.prisma, input.groupId, [input.fromMemberId, input.toMemberId]);
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
      transactionId: transaction.id,
    });
    // Immediate lane (FR-11.1): the payee hears about this now, not tomorrow.
    // Never throws — a failed email must not undo a recorded settlement.
    await notifySettlementRecorded({
      prisma: ctx.prisma,
      channels: ctx.notificationChannels ?? [],
      transactionId: transaction.id,
      now: new Date(),
    });
    return shapeTransaction(transaction);
  }),

  /** Edit an existing expense/income in place (FR-4.x). Recomputes splits + FX. */
  updateExpense: protectedProcedure.input(updateExpenseInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.transaction.findUniqueOrThrow({
      where: { id: input.transactionId },
      select: { groupId: true, type: true },
    });
    await assertGroupAccess(ctx.prisma, ctx.user, existing.groupId);
    if (existing.type === 'TRANSFER') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Settlements are edited via updateTransfer',
      });
    }
    const group = await ctx.prisma.group.findUniqueOrThrow({ where: { id: existing.groupId } });

    if (input.category && isCustomCategoryKey(input.category)) {
      const exists = await ctx.prisma.groupCategory.findFirst({
        where: { id: input.category.slice('custom:'.length), groupId: existing.groupId },
        select: { id: true },
      });
      if (!exists) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown category' });
      }
    }

    const plan = planExpense(input);
    await assertMembersInGroup(ctx.prisma, existing.groupId, [
      ...input.payers.map((p) => p.memberId),
      ...plan.shares.map((s) => s.memberId),
    ]);
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
    const receiptItemsCreate = itemizedReceiptItemsCreate(input.split);

    const transaction = await ctx.prisma.transaction.update({
      where: { id: input.transactionId },
      data: {
        type: input.type,
        title: input.title,
        note: input.note,
        currency: input.currency,
        totalMinorUnits: fromMinor(sign * plan.totalMinorUnits),
        baseMinorUnits: fromMinor(baseTotal),
        exchangeRateToBase: new Prisma.Decimal(rateDecimal),
        fxRateOverridden: overridden,
        date: input.date,
        category: input.category ?? null,
        splitType: plan.splitType,
        receiptId: input.receiptId,
        // Replace the per-member rows wholesale — the simplest correct way to
        // re-key payers/splits when the amount, split, or membership changed.
        payers: {
          deleteMany: {},
          create: input.payers.map((p) => ({
            memberId: p.memberId,
            amountMinorUnits: fromMinor(sign * p.amountMinorUnits),
          })),
        },
        splits: {
          deleteMany: {},
          create: splitCreateData(input.split, plan.shares, sign),
        },
        receiptItems: {
          deleteMany: {},
          ...(receiptItemsCreate ? { create: receiptItemsCreate } : {}),
        },
      },
      include: transactionInclude,
    });
    await logActivity(ctx.prisma, existing.groupId, ctx.user.id, 'transaction.updated', {
      title: input.title,
      transactionId: transaction.id,
    });
    return shapeTransaction(transaction);
  }),

  /** Edit an existing settlement/transfer in place. */
  updateTransfer: protectedProcedure.input(updateTransferInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.transaction.findUniqueOrThrow({
      where: { id: input.transactionId },
      select: { groupId: true, type: true, date: true },
    });
    await assertGroupAccess(ctx.prisma, ctx.user, existing.groupId);
    if (existing.type !== 'TRANSFER') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Only settlements are edited via updateTransfer',
      });
    }
    const group = await ctx.prisma.group.findUniqueOrThrow({ where: { id: existing.groupId } });
    await assertMembersInGroup(ctx.prisma, existing.groupId, [
      input.fromMemberId,
      input.toMemberId,
    ]);
    const date = input.date ?? existing.date;
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

    const transaction = await ctx.prisma.transaction.update({
      where: { id: input.transactionId },
      data: {
        title: input.note ?? 'Settlement',
        currency: input.currency,
        totalMinorUnits: fromMinor(input.amountMinorUnits),
        baseMinorUnits: fromMinor(baseAmount),
        exchangeRateToBase: new Prisma.Decimal(rateDecimal),
        date,
        fromMemberId: input.fromMemberId,
        toMemberId: input.toMemberId,
        method: input.method,
        settledAt: date,
        payers: {
          deleteMany: {},
          create: [
            { memberId: input.fromMemberId, amountMinorUnits: fromMinor(input.amountMinorUnits) },
          ],
        },
        splits: {
          deleteMany: {},
          create: [
            { memberId: input.toMemberId, computedMinorUnits: fromMinor(input.amountMinorUnits) },
          ],
        },
      },
      include: transactionInclude,
    });
    await logActivity(ctx.prisma, existing.groupId, ctx.user.id, 'transaction.updated', {
      title: transaction.title,
      transactionId: transaction.id,
    });
    return shapeTransaction(transaction);
  }),

  list: protectedProcedure
    .input(z.object({ groupId: z.string(), limit: z.number().int().min(1).max(200).default(100) }))
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      const txns = await ctx.prisma.transaction.findMany({
        where: { groupId: input.groupId },
        orderBy: { date: 'desc' },
        take: input.limit,
        include: transactionInclude,
      });
      return txns.map(shapeTransaction);
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

  /**
   * Materialize this group's due recurring occurrences on demand.
   *
   * The scheduled `/api/cron/notifications` job does this for every group; this
   * procedure remains so a client can force a group to catch up immediately.
   */
  materializeDue: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      return materializeRecurring({ prisma: ctx.prisma, now: new Date(), groupId: input.groupId });
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
