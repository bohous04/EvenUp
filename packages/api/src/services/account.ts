/**
 * GDPR-compliant account deletion (FR-1.6), shared by the user's own
 * self-deletion and admin-initiated deletion: solo groups are deleted; in shared
 * groups the user's memberships are deactivated (if used in transactions) or
 * removed, and their bank details (PII) are always dropped; scan-ledger rows
 * with no retention obligation are deleted, while PURCHASE rows are payment
 * records Czech accounting law requires keeping -- GDPR Art. 17(3)(b) lets that
 * obligation override the right to erasure, so they're detached from the
 * person (userId -> null) rather than deleted; finally the user row is deleted
 * (sessions/accounts cascade).
 *
 * Subscription rows are retained under the same Art. 17(3)(b) rationale, but
 * passively: there is no step for them below. The schema's
 * `onDelete: SetNull` on Subscription.userId detaches them automatically when
 * the user row goes. This is deliberate and permanent -- there is no cleanup
 * job anywhere that revisits them -- not an omission to fix.
 *
 * **Receipt images are the one thing the database cannot erase for us.**
 * Deleting a solo group cascades its `Receipt` rows away (schema
 * `onDelete: Cascade`), and with them the only record of the object-storage
 * keys those photos live under. `receipt-cleanup.ts` -- the sole code path that
 * ever removes a blob -- iterates *surviving* `Receipt` rows, so once the row
 * is gone nothing will ever revisit the objects: an erasure request inside the
 * retention window would leave the photos in storage forever (Art. 17). The
 * keys are therefore collected inside the transaction, before the cascade
 * destroys them, and the blobs are removed after it commits.
 *
 * Two deliberate properties of that removal:
 * - It happens **outside** the transaction. An object-store call is a network
 *   round trip to a third party; holding a database transaction open across one
 *   would let a slow or hanging S3 endpoint pin a connection and its locks.
 * - It is **best-effort and logged**, following `receipt-cleanup.ts`. The user
 *   asked to be erased and the database work has already committed; a storage
 *   outage must not turn that into an error the caller sees, or worse, an
 *   erasure the user is told failed after it happened. A key that survives a
 *   failure here is orphaned -- unreferenced by any row, unreachable from the
 *   app -- and the warning is what a cleanup would be driven from.
 */
import type { PrismaClient } from '@evenup/db';
import type { ObjectStore } from '../storage/object-store.js';

export async function deleteUserAccount(
  prisma: PrismaClient,
  userId: string,
  objectStore?: ObjectStore,
): Promise<void> {
  const orphanedKeys = await prisma.$transaction(async (tx) => {
    // Storage keys of receipts about to be cascaded away with a solo group.
    const doomedKeys: string[] = [];
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
        // Read the keys first: the cascade below takes the rows that hold them.
        const receipts = await tx.receipt.findMany({
          where: { groupId, storageKeys: { isEmpty: false } },
          select: { storageKeys: true },
        });
        for (const r of receipts) doomedKeys.push(...r.storageKeys);
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
    // Usage rows are personal data with no retention obligation — delete them.
    // PURCHASE rows are accounting records: Czech law requires keeping them and
    // that obligation overrides the right to erasure (GDPR Art. 17(3)(b)). The
    // schema's onDelete: SetNull detaches them from the person as the user row
    // goes, so the row no longer has a local foreign key to a user record.
    // That nulls the *local* link only -- it is pseudonymization, not
    // anonymization. The retained stripeEventId (and, for Subscription rows,
    // stripeSubscriptionId) is a live Stripe object id that anyone with Stripe
    // access can resolve to the Stripe Customer, and therefore the person's
    // email and name. This data stays personal data under GDPR; retention is
    // lawful via Art. 17(3)(b), not because it has become anonymous.
    await tx.scanLedger.deleteMany({
      where: { userId, reason: { not: 'PURCHASE' } },
    });

    // Sessions + accounts cascade on user delete (schema onDelete: Cascade).
    await tx.user.delete({ where: { id: userId } });
    return doomedKeys;
  });

  // Committed: the erasure has happened. Everything below is clean-up of blobs
  // the database no longer references, and may not fail the operation.
  if (!objectStore) return;
  for (const key of orphanedKeys) {
    try {
      await objectStore.deleteObject(key);
    } catch (err) {
      // Per key, not per batch: there is no row left to retry from, so a single
      // bad key must not strand the rest of the user's photos in storage.
      console.warn(`[account-delete] object delete failed for ${key}, now orphaned`, err);
    }
  }
}
