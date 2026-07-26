/**
 * Credit balance mutations. `User.creditBalance` is denormalised for a cheap
 * pre-scan check, but every change writes a `ScanLedger` row in the same
 * transaction, so the balance is always reconstructible from the ledger.
 */
import { LedgerReason, type PrismaClient } from '@evenup/db';

/**
 * Atomically take one credit. Returns false when the balance is zero.
 * The conditional `updateMany` is what makes concurrent scans safe: only one
 * caller can win the row when a single credit remains.
 */
export async function reserveCredit(prisma: PrismaClient, userId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({
      where: { id: userId, creditBalance: { gt: 0 } },
      data: { creditBalance: { decrement: 1 } },
    });
    if (count === 0) return false;
    await tx.scanLedger.create({
      data: { userId, delta: -1, reason: LedgerReason.CREDIT_SCAN },
    });
    return true;
  });
}

/** Give back a credit taken by `reserveCredit` when the scan failed. */
export async function refundCredit(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { creditBalance: { increment: 1 } },
    });
    await tx.scanLedger.create({
      data: { userId, delta: 1, reason: LedgerReason.REFUND },
    });
  });
}

/**
 * Record a scan covered by the subscription allowance. No reservation: VIP
 * usage is counted from the ledger, and overshooting the cap by one under
 * concurrency costs a fraction of a crown.
 */
export async function recordVipScan(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.scanLedger.create({
    data: { userId, delta: 0, reason: LedgerReason.VIP_SCAN },
  });
}

/**
 * Apply a completed purchase. Returns false if this idempotency key was
 * already applied — the unique constraint on `stripeEventId` makes replay a
 * no-op at the database rather than in application logic.
 *
 * `stripeEventId` need not be a literal Stripe event id: callers should pass
 * whatever value is stable for one purchase across every event that could
 * report it as paid. See `webhook.ts`, which keys checkout purchases on the
 * checkout session id rather than `event.id` for exactly this reason.
 */
export async function creditPurchase(
  prisma: PrismaClient,
  args: {
    userId: string;
    scans: number;
    stripeEventId: string;
    withdrawalConsentAt: Date;
  },
): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.scanLedger.create({
        data: {
          userId: args.userId,
          delta: args.scans,
          reason: LedgerReason.PURCHASE,
          stripeEventId: args.stripeEventId,
          withdrawalConsentAt: args.withdrawalConsentAt,
        },
      });
      await tx.user.update({
        where: { id: args.userId },
        data: { creditBalance: { increment: args.scans } },
      });
    });
    return true;
  } catch (err) {
    // P2002 = unique constraint violation on stripeEventId: already applied.
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
      return false;
    }
    throw err;
  }
}

/** Admin remedy: hand a user credits (e.g. after a lost-credit incident). */
export async function grantCredits(
  prisma: PrismaClient,
  userId: string,
  scans: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.scanLedger.create({
      data: { userId, delta: scans, reason: LedgerReason.ADMIN_GRANT },
    });
    await tx.user.update({
      where: { id: userId },
      data: { creditBalance: { increment: scans } },
    });
  });
}

/** How many subscription scans the user has used in the given period. */
export async function countVipScansInPeriod(
  prisma: PrismaClient,
  userId: string,
  from: Date,
  to: Date,
): Promise<number> {
  return prisma.scanLedger.count({
    where: { userId, reason: LedgerReason.VIP_SCAN, createdAt: { gte: from, lt: to } },
  });
}
