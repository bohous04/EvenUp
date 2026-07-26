/** Member management (PRD §4.2). */
import { z } from 'zod';
import {
  deriveInitials,
  colorForIndex,
  isValidIban,
  normalizeIban,
  nameSimilarity,
} from '@evenup/core';
import type { PrismaClient, Prisma } from '@evenup/db';
import { TRPCError } from '@trpc/server';
import { t as translate } from '@evenup/i18n';
import { router, protectedProcedure } from '../trpc.js';
import { addMemberInput, setBankDetailInput, memberRole } from '../schemas.js';
import { assertGroupAccess } from '../access.js';
import { logActivity } from '../services/activity.js';
import { getGroupBalances } from '../services/balance-service.js';

async function groupIdForMember(ctx: { prisma: PrismaClient }, memberId: string) {
  const member = await ctx.prisma.member.findUnique({
    where: { id: memberId },
    select: { groupId: true },
  });
  if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
  return member.groupId;
}

/**
 * Sum two nullable `Int?` columns (e.g. `TransactionSplit.shareWeight`),
 * staying null only when both sides are null. Not safe for money columns —
 * those are `BigInt`/`Decimal` and must go through `sumNullableBigInt` /
 * `sumNullableDecimal` instead, or precision is lost via `number`.
 */
function sumNullableInt(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}

function sumNullableBigInt(a: bigint | null, b: bigint | null): bigint | null {
  return a === null && b === null ? null : (a ?? 0n) + (b ?? 0n);
}

function sumNullableDecimal(
  a: Prisma.Decimal | null,
  b: Prisma.Decimal | null,
): Prisma.Decimal | null {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return a.add(b);
}

/**
 * Below this, two names are not the same person. Deliberately conservative —
 * a false banner asking "is this the same person?" about two genuinely
 * different people is worse than missing one, because the manual merge action
 * covers whatever detection misses.
 */
const DUPLICATE_MATCH_THRESHOLD = 0.8;

export const memberRouter = router({
  add: protectedProcedure.input(addMemberInput).mutation(async ({ ctx, input }) => {
    await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
    const count = await ctx.prisma.member.count({ where: { groupId: input.groupId } });
    const member = await ctx.prisma.member.create({
      data: {
        groupId: input.groupId,
        displayName: input.displayName,
        initials: deriveInitials(input.displayName),
        color: input.color ?? colorForIndex(count),
        defaultShare: input.defaultShare,
        role: input.role,
      },
    });
    await logActivity(ctx.prisma, input.groupId, ctx.user.id, 'member.added', {
      name: member.displayName,
    });
    return member;
  }),

  list: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      return ctx.prisma.member.findMany({
        where: { groupId: input.groupId },
        orderBy: { createdAt: 'asc' },
        include: { bankDetail: { select: { recipientName: true, variableSymbol: true } } },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        memberId: z.string(),
        displayName: z.string().trim().min(1).max(80).optional(),
        defaultShare: z.number().int().min(1).max(1000).optional(),
        role: memberRole.optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const groupId = await groupIdForMember(ctx, input.memberId);
      await assertGroupAccess(ctx.prisma, ctx.user, groupId);
      const updated = await ctx.prisma.member.update({
        where: { id: input.memberId },
        data: {
          displayName: input.displayName,
          initials: input.displayName ? deriveInitials(input.displayName) : undefined,
          defaultShare: input.defaultShare,
          role: input.role,
          isActive: input.isActive,
        },
      });
      await logActivity(ctx.prisma, groupId, ctx.user.id, 'member.updated', {
        name: updated.displayName,
      });
      return updated;
    }),

  remove: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.prisma.member.findUnique({
        where: { id: input.memberId },
        select: { groupId: true, userId: true },
      });
      if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
      await assertGroupAccess(ctx.prisma, ctx.user, member.groupId);
      // Members that appear in any transaction are deactivated, not deleted
      // (FR-2.4). Members linked to a user account (userId !== null) are
      // deactivated too, for a second reason: invite.claim's "already a
      // member" guard looks the caller up by { groupId, userId }, and a
      // hard-deleted row is as invisible to that lookup as a self-deactivated
      // one was before that variant was closed -- except irreversibly, since
      // the row and its balance are simply gone. That let a non-admin remove
      // their own (transaction-free) member, claim someone else's, then
      // repeat the trick on the member they just took over, walking through
      // the group one identity at a time. Only an unlinked placeholder with
      // no transaction history may still be hard-deleted.
      const usage = await ctx.prisma.transactionSplit.count({
        where: { memberId: input.memberId },
      });
      const asPayer = await ctx.prisma.transactionPayer.count({
        where: { memberId: input.memberId },
      });
      if (usage > 0 || asPayer > 0 || member.userId !== null) {
        return ctx.prisma.member.update({
          where: { id: input.memberId },
          data: { isActive: false },
        });
      }
      await ctx.prisma.member.delete({ where: { id: input.memberId } });
      return { deleted: true };
    }),

  /**
   * Fold `source` into `target`, deleting `source`.
   *
   * `target` survives so the group keeps the identity it already recognises
   * (name, colour, history) and inherits `source`'s account link. The common
   * case is a newcomer who created a duplicate instead of claiming the
   * placeholder holding their debts (spec 2026-07-25).
   */
  merge: protectedProcedure
    .input(z.object({ sourceMemberId: z.string(), targetMemberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.sourceMemberId === input.targetMemberId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot merge a member into itself' });
      }
      const [source, target] = await Promise.all([
        ctx.prisma.member.findUnique({ where: { id: input.sourceMemberId } }),
        ctx.prisma.member.findUnique({ where: { id: input.targetMemberId } }),
      ]);
      if (!source || !target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
      }
      if (source.groupId !== target.groupId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Members belong to different groups',
        });
      }
      await assertGroupAccess(ctx.prisma, ctx.user, source.groupId);

      // Two real accounts must never be silently collapsed, whoever asks.
      if (source.userId && target.userId && source.userId !== target.userId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Both members are linked to different accounts',
        });
      }

      // Any member of the group may merge any pair. Groups here are flat by
      // design — there is no admin tier — and every member can already rewrite
      // any expense's payers and splits, so merging grants no capability they
      // did not have. The cross-account guard above is the real constraint.

      // A transfer between the pair would become a payment from a person to
      // themselves. Refuse and name it rather than destroy a money record.
      const selfTransfers = await ctx.prisma.transaction.findMany({
        where: {
          groupId: source.groupId,
          type: 'TRANSFER',
          OR: [
            { fromMemberId: source.id, toMemberId: target.id },
            { fromMemberId: target.id, toMemberId: source.id },
          ],
        },
        select: { id: true, title: true, date: true },
      });
      if (selfTransfers.length > 0) {
        const label = translate(ctx.locale, 'transaction.settlement');
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Resolve the transfer(s) between these members first: ${selfTransfers
            .map((tr) => `${tr.title || label} (${tr.date.toISOString().slice(0, 10)})`)
            .join(', ')}`,
        });
      }

      await ctx.prisma.$transaction(async (tx) => {
        // --- Close the concurrency window FIRST: take FOR UPDATE on `source`
        // before anything else in this transaction. Every insert that
        // references a member (TransactionPayer, TransactionSplit,
        // ItemAssignment, BankDetail — all FK to Member) must first take a
        // FOR KEY SHARE lock on that member row, so a competing write that
        // names `source` now blocks for the duration of this transaction
        // instead of landing invisibly between our snapshots and the delete.
        // When we commit and delete `source`, the blocked insert wakes up
        // and fails with a foreign-key violation (Postgres 23503) instead of
        // being silently cascade-deleted. This is what actually closes the
        // window — Postgres is READ COMMITTED (no isolationLevel is set on
        // this $transaction), so without an explicit lock every statement
        // below would see its own fresh snapshot and a same-instant write
        // could slip through unseen.
        await tx.$queryRaw`SELECT id FROM "Member" WHERE id = ${source.id} FOR UPDATE`;

        // --- Payers: unique on [transactionId, memberId], so a shared
        // transaction means summing rather than repointing.
        const [sourcePayers, targetPayers] = await Promise.all([
          tx.transactionPayer.findMany({ where: { memberId: source.id } }),
          tx.transactionPayer.findMany({ where: { memberId: target.id } }),
        ]);
        const targetPayerByTxn = new Map(targetPayers.map((p) => [p.transactionId, p]));
        for (const sp of sourcePayers) {
          const tp = targetPayerByTxn.get(sp.transactionId);
          if (tp) {
            await tx.transactionPayer.update({
              where: { id: tp.id },
              data: { amountMinorUnits: tp.amountMinorUnits + sp.amountMinorUnits },
            });
            await tx.transactionPayer.delete({ where: { id: sp.id } });
          } else {
            await tx.transactionPayer.update({
              where: { id: sp.id },
              data: { memberId: target.id },
            });
          }
        }

        // --- Splits: same constraint. Both rows share the transaction's
        // SplitType, so the same nullable columns are populated on both.
        const [sourceSplits, targetSplits] = await Promise.all([
          tx.transactionSplit.findMany({ where: { memberId: source.id } }),
          tx.transactionSplit.findMany({ where: { memberId: target.id } }),
        ]);
        const targetSplitByTxn = new Map(targetSplits.map((s) => [s.transactionId, s]));
        for (const ss of sourceSplits) {
          const ts = targetSplitByTxn.get(ss.transactionId);
          if (ts) {
            await tx.transactionSplit.update({
              where: { id: ts.id },
              data: {
                computedMinorUnits: ts.computedMinorUnits + ss.computedMinorUnits,
                exactMinorUnits: sumNullableBigInt(ts.exactMinorUnits, ss.exactMinorUnits),
                shareWeight: sumNullableInt(ts.shareWeight, ss.shareWeight),
                percentage: sumNullableDecimal(ts.percentage, ss.percentage),
              },
            });
            await tx.transactionSplit.delete({ where: { id: ss.id } });
          } else {
            await tx.transactionSplit.update({
              where: { id: ss.id },
              data: { memberId: target.id },
            });
          }
        }

        // --- Receipt item assignments: composite PK [receiptItemId, memberId].
        // A shared item just means the source row is redundant.
        const sourceAssignments = await tx.itemAssignment.findMany({
          where: { memberId: source.id },
        });
        for (const sa of sourceAssignments) {
          const existing = await tx.itemAssignment.findUnique({
            where: {
              receiptItemId_memberId: {
                receiptItemId: sa.receiptItemId,
                memberId: target.id,
              },
            },
          });
          if (existing) {
            await tx.itemAssignment.delete({
              where: {
                receiptItemId_memberId: {
                  receiptItemId: sa.receiptItemId,
                  memberId: source.id,
                },
              },
            });
          } else {
            await tx.itemAssignment.update({
              where: {
                receiptItemId_memberId: {
                  receiptItemId: sa.receiptItemId,
                  memberId: source.id,
                },
              },
              data: { memberId: target.id },
            });
          }
        }

        // --- Transfers. Any transfer BETWEEN the pair was already rejected in
        // preflight, so nothing here can become a self-transfer.
        await tx.transaction.updateMany({
          where: { fromMemberId: source.id },
          data: { fromMemberId: target.id },
        });
        await tx.transaction.updateMany({
          where: { toMemberId: source.id },
          data: { toMemberId: target.id },
        });

        // --- Bank details: memberId is unique, so the target's own row wins.
        const [sourceBank, targetBank] = await Promise.all([
          tx.bankDetail.findUnique({ where: { memberId: source.id } }),
          tx.bankDetail.findUnique({ where: { memberId: target.id } }),
        ]);
        if (sourceBank && !targetBank) {
          await tx.bankDetail.update({
            where: { memberId: source.id },
            data: { memberId: target.id },
          });
        }

        // --- The surviving member keeps its own identity (displayName,
        // initials, color) but gains the link, and takes the STRONGER of the
        // two on role/isActive: losing ADMIN could leave the group with no
        // admin at all, and losing active-ness would strand real debt on a
        // member hidden from the picker/notifications/next-round.
        await tx.member.update({
          where: { id: target.id },
          data: {
            userId: target.userId ?? source.userId,
            role: source.role === 'ADMIN' || target.role === 'ADMIN' ? 'ADMIN' : target.role,
            isActive: source.isActive || target.isActive,
          },
        });

        // --- Belt-and-braces assertion, immediately before the delete. The
        // FOR UPDATE lock taken at the top of this transaction is what
        // actually closes the concurrency window (it also covers BankDetail,
        // the one FK-to-Member path deliberately left out of this count —
        // counting it would spuriously abort every merge where both members
        // already have a bank detail, which is a legitimate, common case).
        // This count is a cheap secondary check: it does not by itself
        // guarantee no row was lost (a write that landed and committed
        // before the lock was taken, i.e. before this transaction even
        // started, would already be reflected in the snapshots above and
        // simply merged normally; this guard exists to catch anything that
        // still slips past that story, e.g. bugs in the lock coverage
        // itself). If it ever fires, treat it as a bug: a concurrent insert
        // naming `source` should have blocked on FOR UPDATE and then failed
        // with a foreign-key violation on delete, not landed here at all.
        // TransactionPayer.memberId and TransactionSplit.memberId are both
        // `onDelete: Cascade`, so an unnoticed leftover row would otherwise
        // be silently destroyed, either re-spreading a lost split's base
        // across the survivors (money moves silently, balances still net to
        // zero) or leaving a lost sole-payer row's transaction with a
        // non-zero base and zero weights, which throws inside
        // allocateByWeights and breaks balance.get for the whole group.
        // Abort and roll back the whole transaction instead.
        const stillReferenced =
          (await tx.transactionPayer.count({ where: { memberId: source.id } })) +
          (await tx.transactionSplit.count({ where: { memberId: source.id } })) +
          (await tx.itemAssignment.count({ where: { memberId: source.id } })) +
          (await tx.transaction.count({
            where: { OR: [{ fromMemberId: source.id }, { toMemberId: source.id }] },
          }));
        if (stillReferenced > 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Source member changed while merging — please try again.',
          });
        }

        await tx.member.delete({ where: { id: source.id } });

        // Log inside the transaction, on `tx`: this payload is the sole
        // surviving record of `source.id`/`sourceUserId` once the delete
        // above commits, so if the log can't be written the merge must roll
        // back rather than complete silently untraceable.
        await logActivity(tx, source.groupId, ctx.user.id, 'member.merged', {
          from: source.displayName,
          into: target.displayName,
          // Once `source` is deleted nothing else retains its id -- keep it
          // here so an erroneous merge can still be reconstructed.
          sourceMemberId: source.id,
          targetMemberId: target.id,
          sourceUserId: source.userId,
        });
      });

      return { merged: true, targetMemberId: target.id };
    }),

  /**
   * Claimed members that look like they duplicate an unclaimed placeholder.
   *
   * `invite.claim` derives a new member's name from the account name or the
   * email local-part, so the duplicate usually carries a recognisable form of
   * the placeholder's name — all three are compared.
   */
  duplicateCandidates: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      const members = await ctx.prisma.member.findMany({
        where: { groupId: input.groupId, isActive: true },
        include: { user: { select: { name: true, email: true } } },
      });

      const unclaimed = members.filter((m) => m.userId === null);
      if (unclaimed.length === 0) return [];

      // Pairs somebody already answered "not the same person" to. The answer is
      // group-wide on purpose: the question is about two OTHER people, so once
      // anyone has settled it, re-asking everyone else is noise.
      const dismissed = new Set(
        (
          await ctx.prisma.mergeDismissal.findMany({
            where: { groupId: input.groupId },
            select: { sourceMemberId: true, targetMemberId: true },
          })
        ).map((d) => `${d.sourceMemberId}:${d.targetMemberId}`),
      );

      const candidates = [];
      for (const claimed of members.filter((m) => m.userId !== null)) {
        const aliases = [
          claimed.displayName,
          claimed.user?.name ?? '',
          claimed.user?.email?.split('@')[0] ?? '',
        ].filter(Boolean);

        for (const placeholder of unclaimed) {
          const score = Math.max(
            ...aliases.map((alias) => nameSimilarity(alias, placeholder.displayName)),
          );
          if (
            score >= DUPLICATE_MATCH_THRESHOLD &&
            !dismissed.has(`${claimed.id}:${placeholder.id}`)
          ) {
            candidates.push({
              sourceMemberId: claimed.id,
              sourceName: claimed.displayName,
              targetMemberId: placeholder.id,
              targetName: placeholder.displayName,
              score,
            });
          }
        }
      }
      return candidates.sort((a, b) => b.score - a.score);
    }),

  /**
   * Record "these two are not the same person", suppressing that suggestion for
   * the whole group rather than just the browser that clicked it.
   *
   * Any group member may answer: the banner is shown to whoever opens the
   * group, so anyone who can see the question can settle it. It only ever
   * hides a *suggestion* — the manual merge action stays available, so a
   * mistaken dismissal costs discoverability, never data.
   */
  dismissDuplicate: protectedProcedure
    .input(z.object({ sourceMemberId: z.string(), targetMemberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.sourceMemberId === input.targetMemberId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot dismiss a member against itself',
        });
      }
      const [source, target] = await Promise.all([
        ctx.prisma.member.findUnique({ where: { id: input.sourceMemberId } }),
        ctx.prisma.member.findUnique({ where: { id: input.targetMemberId } }),
      ]);
      if (!source || !target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
      }
      if (source.groupId !== target.groupId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Members belong to different groups' });
      }
      await assertGroupAccess(ctx.prisma, ctx.user, source.groupId);

      // Idempotent: clicking "not the same" twice must not 500 on the unique.
      await ctx.prisma.mergeDismissal.upsert({
        where: {
          sourceMemberId_targetMemberId: {
            sourceMemberId: source.id,
            targetMemberId: target.id,
          },
        },
        create: {
          groupId: source.groupId,
          sourceMemberId: source.id,
          targetMemberId: target.id,
          dismissedById: ctx.user.id,
        },
        update: {},
      });
      return { dismissed: true };
    }),

  /**
   * What `merge` would do, without doing it. Blocking transfers are RETURNED
   * rather than thrown so the dialog can explain the refusal in place.
   */
  mergePreview: protectedProcedure
    .input(z.object({ sourceMemberId: z.string(), targetMemberId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (input.sourceMemberId === input.targetMemberId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot merge a member into itself' });
      }
      const [source, target] = await Promise.all([
        ctx.prisma.member.findUnique({ where: { id: input.sourceMemberId } }),
        ctx.prisma.member.findUnique({ where: { id: input.targetMemberId } }),
      ]);
      if (!source || !target || source.groupId !== target.groupId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
      }
      await assertGroupAccess(ctx.prisma, ctx.user, source.groupId);

      const group = await ctx.prisma.group.findUniqueOrThrow({
        where: { id: source.groupId },
        select: { baseCurrency: true },
      });

      const transactionIds = new Set<string>();
      for (const row of await ctx.prisma.transactionPayer.findMany({
        where: { memberId: source.id },
        select: { transactionId: true },
      })) {
        transactionIds.add(row.transactionId);
      }
      for (const row of await ctx.prisma.transactionSplit.findMany({
        where: { memberId: source.id },
        select: { transactionId: true },
      })) {
        transactionIds.add(row.transactionId);
      }

      const { balances } = await getGroupBalances(ctx.prisma, source.groupId);
      const balanceById = new Map(balances.map((b) => [b.memberId, b.balanceMinorUnits]));
      const moving = balanceById.get(source.id) ?? 0;
      const current = balanceById.get(target.id) ?? 0;

      const blockingTransfers = await ctx.prisma.transaction.findMany({
        where: {
          groupId: source.groupId,
          type: 'TRANSFER',
          OR: [
            { fromMemberId: source.id, toMemberId: target.id },
            { fromMemberId: target.id, toMemberId: source.id },
          ],
        },
        select: { id: true, title: true },
      });

      return {
        sourceName: source.displayName,
        targetName: target.displayName,
        transactionCount: transactionIds.size,
        movingBalanceMinorUnits: moving,
        // Balances are additive across a merge for same-currency groups; a
        // cross-currency group may land ±1 minor unit off (see the plan's
        // Global Constraints), so this is a preview, not a guarantee.
        resultingBalanceMinorUnits: current + moving,
        baseCurrency: group.baseCurrency,
        blockingTransfers,
      };
    }),

  /** @deprecated Per-member bank details are legacy; the web app now stores the account on the User (spec 2026-07-09). Kept for mobile/back-compat and as a read fallback in generateSpayd. */
  setBankDetail: protectedProcedure.input(setBankDetailInput).mutation(async ({ ctx, input }) => {
    const groupId = await groupIdForMember(ctx, input.memberId);
    await assertGroupAccess(ctx.prisma, ctx.user, groupId);
    const iban = normalizeIban(input.iban);
    if (!isValidIban(iban)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid IBAN' });
    }
    const ibanEncrypted = ctx.secretBox.encrypt(iban);
    return ctx.prisma.bankDetail.upsert({
      where: { memberId: input.memberId },
      create: {
        memberId: input.memberId,
        ibanEncrypted,
        recipientName: input.recipientName,
        variableSymbol: input.variableSymbol,
      },
      update: {
        ibanEncrypted,
        recipientName: input.recipientName,
        variableSymbol: input.variableSymbol,
      },
      // Never return the encrypted IBAN to clients (§9.2).
      select: { id: true, memberId: true, recipientName: true, variableSymbol: true },
    });
  }),
});
