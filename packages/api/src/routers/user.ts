/** User profile & settings (PRD §7.2, §6.2, FR-1.6). */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { deriveInitials, parseCzAccount, maskCzAccount } from '@evenup/core';
import { router, protectedProcedure } from '../trpc.js';
import { currencyCode } from '../schemas.js';
import { deleteUserAccount } from '../services/account.js';
import { logActivity } from '../services/activity.js';

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        locale: true,
        defaultCurrency: true,
        ocrModel: true,
        hideProfilePhoto: true,
        bankAccountEncrypted: true,
        isAdmin: true,
        isVip: true,
        twoFactorEnabled: true,
        // Needed by the client to decide whether to prompt for OCR consent.
        // A timestamp, not a boolean, so support can see when it was given.
        ocrConsentAt: true,
      },
    });
    // Expose only derived, non-sensitive facts here — `me` is fetched on many
    // pages (header, OCR, admin). The plaintext bank account (PII) never rides
    // this hot, widely-cached query; the full account lives behind the
    // dedicated, settings-only `getBankAccount` below.
    const { bankAccountEncrypted, ...rest } = user;
    return {
      ...rest,
      hasBankAccount: bankAccountEncrypted !== null,
    };
  }),

  /**
   * The owner's own stored bank account, in full. Kept off `me` so the plaintext
   * PII is only fetched/cached on the settings screen that actually displays it.
   * Owner-scoped; decryption fails closed (null).
   */
  getBankAccount: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { bankAccountEncrypted: true },
    });
    if (user.bankAccountEncrypted === null) return { account: null };
    try {
      return { account: ctx.secretBox.decrypt(user.bankAccountEncrypted) };
    } catch {
      return { account: null };
    }
  }),

  updateSettings: protectedProcedure
    .input(
      z.object({
        locale: z.enum(['cs', 'en']).optional(),
        defaultCurrency: currencyCode.optional(),
        ocrModel: z.string().max(120).optional(),
        hideProfilePhoto: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.user.update({ where: { id: ctx.user.id }, data: input });
      return { ok: true };
    }),

  /** Rename the account AND every group member linked to it (spec 2026-07-09 §4). */
  updateProfile: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const linked = await ctx.prisma.member.findMany({
        where: { userId: ctx.user.id },
        select: { id: true, groupId: true },
      });
      await ctx.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: ctx.user.id }, data: { name: input.name } });
        if (linked.length > 0) {
          await tx.member.updateMany({
            where: { userId: ctx.user.id },
            data: { displayName: input.name, initials: deriveInitials(input.name) },
          });
        }
        for (const groupId of new Set(linked.map((m) => m.groupId))) {
          await logActivity(tx, groupId, ctx.user.id, 'member.updated', { name: input.name });
        }
      });
      return { ok: true as const, membersRenamed: linked.length };
    }),

  /**
   * Set the user's profile picture, stored as a (client-downscaled) image data
   * URL in `User.image` — the same field OAuth providers populate with a photo
   * URL, so it renders identically wherever a member's chip appears. Bounded in
   * size to keep it out of the way in the member queries that carry it.
   */
  setAvatar: protectedProcedure
    .input(z.object({ image: z.string().startsWith('data:image/').max(300_000) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { image: input.image },
      });
      return { ok: true as const };
    }),

  /** Remove the profile picture, falling back to the monogram everywhere. */
  clearAvatar: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.user.update({ where: { id: ctx.user.id }, data: { image: null } });
    return { ok: true as const };
  }),

  /** Store the CZ bank account used for SPAYD QR in all groups (spec §4). */
  setBankAccount: protectedProcedure
    .input(z.object({ account: z.string().trim().max(30) }))
    .mutation(async ({ ctx, input }) => {
      const compact = input.account.replace(/\s+/g, '');
      if (!parseCzAccount(compact)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid account number' });
      }
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { bankAccountEncrypted: ctx.secretBox.encrypt(compact) },
      });
      return { ok: true as const, masked: maskCzAccount(compact) };
    }),

  clearBankAccount: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.user.update({
      where: { id: ctx.user.id },
      data: { bankAccountEncrypted: null },
    });
    return { ok: true as const };
  }),

  /**
   * Explicit consent to send receipt images to the OCR provider. Receipts can
   * disclose special-category data under GDPR Art. 9 (e.g. a pharmacy
   * purchase reveals health information) and are sent to a third-party AI
   * provider, so this is opt-in and genuinely revocable rather than implied.
   */
  setOcrConsent: protectedProcedure
    .input(z.object({ granted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { ocrConsentAt: input.granted ? new Date() : null },
      });
      return { ok: true as const };
    }),

  /**
   * GDPR export of the user's personal data (FR-1.6, Art. 15 and Art. 20).
   *
   * **The privacy policy calls this a "complete export"** (`legal.privacy.s9.li1`),
   * so the selection below is deliberately organised against the categories
   * that document declares in its §2 rather than against whatever happened to
   * be convenient. Each category maps to one key here:
   *
   * | Policy (`legal.privacy.s2.*`) | Exported as |
   * |---|---|
   * | li1 account, profile photo | `profile` |
   * | li2 sign-in, IP address, browser | `sessions` |
   * | li3 groups and expenses | `groups` |
   * | li4 bank details | `profile.bankAccount`, `bankDetails` |
   * | li5 receipts and what was read from them | `groups[].receipts`, `groups[].transactions[].receiptItems` |
   * | li6 payments | `profile.creditBalance`/`stripeCustomerId`, `billing` |
   * | li7 scanning consent | `profile.ocrConsentAt`, `billing.ledger[].withdrawalConsentAt` |
   * | li8 email and notifications | `notifications` |
   * | li9 error records | `errorLogs` |
   * | (s8.p2) Google/Apple links | `connectedAccounts` |
   *
   * Whole rows are never spread in: every query names its columns, because the
   * secrets live beside the data. `Session.token` is a live credential,
   * `Account.password`/`accessToken`/`refreshToken` are credentials for another
   * service, and `User.bankAccountEncrypted` is ciphertext the owner cannot use
   * — the account number is decrypted into `profile.bankAccount` instead.
   *
   * **Known limitation, deliberately not addressed here:** `groups` carries
   * shared groups whole, so it includes other members' names and the
   * transactions, payers and splits of people who are not the requester. That
   * predates billing and is a design question (a member-scoped projection, or
   * an aggregate of only the requester's share), not a select-list fix.
   */
  exportData: protectedProcedure.query(async ({ ctx }) => {
    const [
      profile,
      groups,
      bankDetails,
      subscriptions,
      ledger,
      sessions,
      connectedAccounts,
      notificationPreferences,
      notificationDeliveries,
      errorLogs,
    ] = await Promise.all([
      ctx.prisma.user.findUniqueOrThrow({
        where: { id: ctx.user.id },
        select: {
          id: true,
          email: true,
          emailVerified: true,
          name: true,
          image: true,
          locale: true,
          defaultCurrency: true,
          ocrModel: true,
          hideProfilePhoto: true,
          notificationsEnabled: true,
          twoFactorEnabled: true,
          isAdmin: true,
          isVip: true,
          // The Art. 7(1) consent record. Named by spec 2 as belonging in the
          // export, and a timestamp rather than a boolean precisely so the
          // person can see *when* they agreed.
          ocrConsentAt: true,
          // Billing state held on the user row. `creditBalance` is a balance
          // the person paid for; `stripeCustomerId` is the identifier that
          // resolves to their record at Stripe, which the policy (s8.p5) tells
          // them exists — so it cannot be missing from their own copy.
          creditBalance: true,
          stripeCustomerId: true,
          createdAt: true,
          bankAccountEncrypted: true,
        },
      }),
      ctx.prisma.group.findMany({
        where: {
          OR: [{ createdById: ctx.user.id }, { members: { some: { userId: ctx.user.id } } }],
        },
        include: {
          members: true,
          // `receiptItems` are the recognised receipt lines the policy's li5
          // promises ("položky, částky") — the expense rows alone carried only
          // totals.
          transactions: { include: { payers: true, splits: true, receiptItems: true } },
          receipts: {
            select: {
              id: true,
              merchant: true,
              detectedCurrency: true,
              detectedTotalMinorUnits: true,
              // The second copy of the OCR result that the policy warns
              // survives a deleted expense (s2.li5). Held about the person,
              // therefore theirs to receive.
              rawJson: true,
              createdAt: true,
            },
          },
        },
      }),
      ctx.prisma.bankDetail.findMany({
        where: { member: { userId: ctx.user.id } },
        select: { memberId: true, recipientName: true, variableSymbol: true },
      }),
      ctx.prisma.subscription.findMany({
        where: { userId: ctx.user.id },
        select: {
          stripeSubscriptionId: true,
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      ctx.prisma.scanLedger.findMany({
        where: { userId: ctx.user.id },
        select: {
          delta: true,
          reason: true,
          stripeEventId: true,
          // The distance-selling consent recorded against a purchase: the
          // moment the customer waived the 14-day withdrawal right. It is the
          // evidence used against them if they ever dispute the purchase, so
          // withholding it from their own export is indefensible.
          withdrawalConsentAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      // Personal data under the policy's li2, and — since `session-cleanup.ts`
      // landed — a category with a stated retention period (s7.li3).
      // `token` is excluded: it is a live credential, not a fact about them.
      ctx.prisma.session.findMany({
        where: { userId: ctx.user.id },
        select: {
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          ipAddress: true,
          userAgent: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      // Which Google/Apple accounts are linked — s8.p2 promises to delete
      // these, so they exist and belong in the export. Tokens and the password
      // hash are credentials and stay out.
      ctx.prisma.account.findMany({
        where: { userId: ctx.user.id },
        select: { providerId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      ctx.prisma.notificationPreference.findMany({
        where: { userId: ctx.user.id },
        select: { groupId: true, muted: true, lastDigestAt: true },
      }),
      // What was sent to them and when. The rendered `payload` is deliberately
      // omitted: it holds other members' names and amounts, which is the wider
      // problem noted above rather than something to widen here.
      ctx.prisma.notificationDelivery.findMany({
        where: { userId: ctx.user.id },
        select: { kind: true, channel: true, status: true, sentAt: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      ctx.prisma.errorLog.findMany({
        where: { userId: ctx.user.id },
        select: { source: true, path: true, code: true, message: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const { bankAccountEncrypted, ...profileRest } = profile;
    let bankAccount: string | null = null;
    if (bankAccountEncrypted !== null) {
      try {
        bankAccount = ctx.secretBox.decrypt(bankAccountEncrypted);
      } catch {
        bankAccount = null;
      }
    }
    return {
      profile: { ...profileRest, bankAccount },
      groups,
      bankDetails,
      billing: { subscriptions, ledger },
      sessions,
      connectedAccounts,
      notifications: { preferences: notificationPreferences, deliveries: notificationDeliveries },
      errorLogs,
    };
  }),

  /** GDPR account deletion (FR-1.6): delete solo groups, unlink shared ones. */
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    // The object store goes with it: deleting a solo group cascades its
    // receipt rows away, and with them the only reference to the stored photos.
    await deleteUserAccount(ctx.prisma, ctx.user.id, ctx.objectStore);
    return { ok: true as const };
  }),
});
