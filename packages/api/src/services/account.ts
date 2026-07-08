/**
 * GDPR-compliant account deletion (FR-1.6), shared by the user's own
 * self-deletion and admin-initiated deletion: solo groups are deleted; in shared
 * groups the user's memberships are deactivated (if used in transactions) or
 * removed, and their bank details (PII) are always dropped; finally the user row
 * is deleted (sessions/accounts cascade).
 */
import type { PrismaClient } from '@evenup/db';

export async function deleteUserAccount(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const memberships = await tx.member.findMany({
      where: { userId },
      select: { id: true, groupId: true },
    });
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
          await tx.member.update({
            where: { id: m.id },
            data: { isActive: false, userId: null },
          });
        } else {
          await tx.member.delete({ where: { id: m.id } });
        }
      }
    }
    // Sessions + accounts cascade on user delete (schema onDelete: Cascade).
    await tx.user.delete({ where: { id: userId } });
  });
}
