/**
 * Instance management for hosted deployments (admin-only): users, VIP/admin
 * flags, the shared OCR key, and the server error log. Every procedure runs
 * through `adminProcedure`, which enforces `isAdmin && !disabledAt` server-side.
 * Key material is never returned to clients.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '../trpc.js';
import { deleteUserAccount } from '../services/account.js';
import { grantCredits } from '../billing/ledger.js';
import { getStripe } from '../billing/stripe.js';
import { isBillingEnabled } from '../billing/prices.js';

const INSTANCE_ID = 'singleton';

const pageInput = z
  .object({
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().optional(),
  })
  .optional();

export const adminRouter = router({
  listUsers: adminProcedure.input(pageInput).query(async ({ ctx, input }) => {
    const limit = input?.limit ?? 50;
    const rows = await ctx.prisma.user.findMany({
      take: limit + 1,
      ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        isAdmin: true,
        isVip: true,
        disabledAt: true,
        createdAt: true,
        creditBalance: true,
        _count: { select: { members: true } },
      },
    });
    let nextCursor: string | undefined;
    if (rows.length > limit) nextCursor = rows.pop()!.id;
    return {
      users: rows.map(({ _count, ...u }) => ({
        ...u,
        memberships: _count.members,
      })),
      nextCursor,
    };
  }),

  setVip: adminProcedure
    .input(z.object({ userId: z.string(), isVip: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.user.update({ where: { id: input.userId }, data: { isVip: input.isVip } });
      return { ok: true };
    }),

  setAdmin: adminProcedure
    .input(z.object({ userId: z.string(), isAdmin: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Guard against self-demotion so an admin can never lock themselves out.
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You cannot change your own admin status.',
        });
      }
      await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { isAdmin: input.isAdmin },
      });
      return { ok: true };
    }),

  setDisabled: adminProcedure
    .input(z.object({ userId: z.string(), disabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You cannot disable your own account.',
        });
      }
      await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { disabledAt: input.disabled ? new Date() : null },
      });
      // Force logout: drop existing sessions so a disabled user is booted now,
      // not just blocked at next sign-in.
      if (input.disabled) {
        await ctx.prisma.session.deleteMany({ where: { userId: input.userId } });
      }
      return { ok: true };
    }),

  deleteUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You cannot delete your own account here; use settings.',
        });
      }
      await deleteUserAccount(ctx.prisma, input.userId, ctx.objectStore);
      return { ok: true };
    }),

  /** Manual remedy — e.g. returning a credit lost to a mid-scan crash. */
  grantCredits: adminProcedure
    .input(z.object({ userId: z.string(), scans: z.number().int().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      await grantCredits(ctx.prisma, input.userId, input.scans);
      return { ok: true };
    }),

  getInstanceConfig: adminProcedure.query(async ({ ctx }) => {
    const cfg = await ctx.prisma.instanceConfig.findUnique({ where: { id: INSTANCE_ID } });
    // Never expose the key; only whether one is configured.
    return { hasKey: !!cfg?.openRouterKeyEncrypted, ocrModel: cfg?.ocrModel ?? null };
  }),

  setInstanceOpenRouterKey: adminProcedure
    .input(z.object({ apiKey: z.string().trim().min(8).max(400) }))
    .mutation(async ({ ctx, input }) => {
      const openRouterKeyEncrypted = ctx.secretBox.encrypt(input.apiKey);
      await ctx.prisma.instanceConfig.upsert({
        where: { id: INSTANCE_ID },
        create: { id: INSTANCE_ID, openRouterKeyEncrypted },
        update: { openRouterKeyEncrypted },
      });
      return { ok: true };
    }),

  clearInstanceOpenRouterKey: adminProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.instanceConfig.upsert({
      where: { id: INSTANCE_ID },
      create: { id: INSTANCE_ID },
      update: { openRouterKeyEncrypted: null },
    });
    return { ok: true };
  }),

  setInstanceOcrModel: adminProcedure
    .input(z.object({ model: z.string().trim().max(120) }))
    .mutation(async ({ ctx, input }) => {
      const model = input.model || null;
      await ctx.prisma.instanceConfig.upsert({
        where: { id: INSTANCE_ID },
        create: { id: INSTANCE_ID, ocrModel: model },
        update: { ocrModel: model },
      });
      return { ok: true };
    }),

  /**
   * Billing dashboard: subscription counts, credits outstanding, and the daily
   * activity series behind the admin charts.
   *
   * **MRR is read from Stripe or reported as unknown — never derived here.**
   * A local `Subscription` row stores the Stripe id, the status and the period,
   * but deliberately not the amount: the VIP price is per-locale (CZK or EUR)
   * and whichever was charged is never written down. Multiplying the
   * *display* price by a subscription count would produce a confident-looking
   * number that is wrong for every EUR subscriber, so `mrr` is `null` whenever
   * Stripe is not reachable, with a reason. Zero would be worse than null —
   * it reads as "no revenue" rather than "we do not know".
   *
   * The counts and the two daily series are computed locally and are exact, so
   * a self-hosted instance with billing switched off still gets a useful
   * panel — it just knows less about money than a hosted one does.
   */
  billingStats: adminProcedure.query(async ({ ctx }) => {
    const DAY_MS = 86_400_000;
    // UTC day buckets, matching how the FX cache keys its own dates. Local
    // midnight would make the same query return different numbers depending on
    // where the admin happens to be sitting.
    const todayUtc = new Date();
    const todayKey = todayUtc.toISOString().slice(0, 10);
    const since = new Date(todayUtc.getTime() - 29 * DAY_MS);
    since.setUTCHours(0, 0, 0, 0);

    const [subs, credits, signups, scans] = await Promise.all([
      ctx.prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
      ctx.prisma.user.aggregate({ _sum: { creditBalance: true } }),
      ctx.prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      ctx.prisma.scanLedger.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

    const statusCount = (status: string) => subs.find((s) => s.status === status)?._count._all ?? 0;

    // A dense series, one entry per day, zeros included: a sparse one leaves
    // gaps that a chart draws as missing data rather than as a flat zero.
    const series = (rows: { createdAt: Date }[]) => {
      const byDay = new Map<string, number>();
      for (const r of rows) {
        const key = r.createdAt.toISOString().slice(0, 10);
        byDay.set(key, (byDay.get(key) ?? 0) + 1);
      }
      return Array.from({ length: 30 }, (_, i) => {
        const d = new Date(since.getTime() + i * DAY_MS);
        const date = d.toISOString().slice(0, 10);
        return { date, count: byDay.get(date) ?? 0 };
      });
    };

    // Cancelling subscriptions are still `active` until the period ends, so
    // they are counted in both buckets rather than being netted out: an
    // operator needs to know how much revenue is actually about to disappear.
    const canceling = await ctx.prisma.subscription.count({
      where: { status: 'active', cancelAtPeriodEnd: true },
    });

    let mrr: { amountMinor: number; currency: string } | null = null;
    // A CODE, not a sentence. This string reaches a Czech admin page, and a
    // hardcoded English reason would be the one untranslated string in the
    // app — the client localizes it.
    let mrrUnavailableReason: 'stripe-not-configured' | 'stripe-unreachable' | null = null;
    const stripe = getStripe();
    if (!stripe) {
      mrrUnavailableReason = 'stripe-not-configured';
    } else {
      try {
        let amountMinor = 0;
        let currency: string | null = null;
        // Paginate: an instance with more than 100 live subscriptions would
        // otherwise report a fraction of its revenue as the whole.
        for await (const s of stripe.subscriptions.list({
          status: 'active',
          limit: 100,
          expand: ['data.items.data.price'],
        })) {
          for (const item of s.items.data) {
            const price = item.price;
            if (!price?.unit_amount) continue;
            amountMinor += price.unit_amount * (item.quantity ?? 1);
            currency = currency ?? price.currency.toUpperCase();
          }
        }
        mrr = { amountMinor, currency: currency ?? 'CZK' };
      } catch {
        // A Stripe outage must not take the admin panel down with it; the
        // local counts above are still good.
        mrrUnavailableReason = 'stripe-unreachable';
      }
    }

    return {
      stripeConfigured: isBillingEnabled(),
      mrr,
      mrrUnavailableReason,
      subscriptions: {
        active: statusCount('active'),
        trialing: statusCount('trialing'),
        pastDue: statusCount('past_due'),
        cancelingAtPeriodEnd: canceling,
        total: subs.reduce((a, s) => a + s._count._all, 0),
      },
      creditsOutstanding: credits._sum.creditBalance ?? 0,
      signupsPerDay: series(signups),
      scansPerDay: series(scans),
      today: todayKey,
    };
  }),

  listErrors: adminProcedure.input(pageInput).query(async ({ ctx, input }) => {
    const limit = input?.limit ?? 50;
    const rows = await ctx.prisma.errorLog.findMany({
      take: limit + 1,
      ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        source: true,
        code: true,
        message: true,
        path: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    });
    let nextCursor: string | undefined;
    if (rows.length > limit) nextCursor = rows.pop()!.id;
    return {
      errors: rows.map(({ user, ...r }) => ({ ...r, userEmail: user?.email ?? null })),
      nextCursor,
    };
  }),
});
