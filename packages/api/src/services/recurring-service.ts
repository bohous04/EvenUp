/**
 * Materialize due occurrences of recurring expense templates (FR-12.1).
 *
 * This used to live inside a `protectedProcedure`, which meant a monthly rent
 * expense did not exist until a signed-in user happened to call it — and no
 * client ever did. It now runs from the notifications cron, before the digest,
 * so today's occurrence lands in today's digest rather than tomorrow's.
 */
import { dueOccurrences, type RecurrenceInterval } from '@evenup/core';
import type { PrismaClient } from '@evenup/db';
import { logActivity } from './activity.js';

export interface MaterializeArgs {
  readonly prisma: PrismaClient;
  readonly now: Date;
  /** Restrict to one group; omit to sweep every non-archived group. */
  readonly groupId?: string;
}

/** Create every occurrence that has come due, and advance each template's cursor. */
export async function materializeRecurring(args: MaterializeArgs): Promise<{ created: number }> {
  const templates = await args.prisma.transaction.findMany({
    where: {
      recurrenceInterval: { not: null },
      ...(args.groupId ? { groupId: args.groupId } : { group: { archivedAt: null } }),
    },
    include: { payers: true, splits: true },
  });

  let created = 0;
  for (const tmpl of templates) {
    const due = dueOccurrences({
      anchor: tmpl.date,
      interval: tmpl.recurrenceInterval as RecurrenceInterval,
      lastRun: tmpl.recurrenceLastRun,
      now: args.now,
    });

    for (const date of due) {
      const occurrence = await args.prisma.transaction.create({
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
        select: { id: true },
      });
      // Actor `null`: nobody did this, the schedule did. System events are never
      // filtered out of anyone's digest (FR-12.1 "auto-create + notify").
      await logActivity(args.prisma, tmpl.groupId, null, 'expense.created', {
        title: tmpl.title,
        transactionId: occurrence.id,
        recurring: true,
      });
      created++;
    }

    const last = due[due.length - 1];
    if (last) {
      await args.prisma.transaction.update({
        where: { id: tmpl.id },
        data: { recurrenceLastRun: last },
      });
    }
  }
  return { created };
}
