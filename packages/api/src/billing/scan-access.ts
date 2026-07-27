/**
 * Gathers the state `resolveScanEntitlement` needs and asks it for a decision.
 * Keeping the I/O here leaves the decision itself pure and exhaustively tested.
 */
import type { PrismaClient } from '@evenup/db';
import { resolveScanEntitlement, type Entitlement } from './entitlement.js';
import { countVipScansInPeriod } from './ledger.js';
import { isBillingEnabled } from './prices.js';

export async function loadEntitlement(
  prisma: PrismaClient,
  userId: string,
  now: Date,
): Promise<Entitlement> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { isVip: true, creditBalance: true },
  });

  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: 'active' },
    orderBy: { currentPeriodEnd: 'desc' },
    select: { status: true, currentPeriodStart: true, currentPeriodEnd: true },
  });

  const vipScansUsedThisPeriod = subscription
    ? await countVipScansInPeriod(
        prisma,
        userId,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
      )
    : 0;

  return resolveScanEntitlement({
    billingEnabled: isBillingEnabled(),
    isVip: user.isVip,
    creditBalance: user.creditBalance,
    subscription,
    vipScansUsedThisPeriod,
    now,
  });
}
