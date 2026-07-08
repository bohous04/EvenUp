/**
 * Instance management for hosted deployments (admin-only): users, VIP/admin
 * flags, the shared OCR key, and the server error log. Every procedure runs
 * through `adminProcedure`, which enforces `isAdmin && !disabledAt` server-side.
 * Key material is never returned to clients.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '../trpc.js';

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
        openRouterKeyEncrypted: true,
        createdAt: true,
        _count: { select: { members: true } },
      },
    });
    let nextCursor: string | undefined;
    if (rows.length > limit) nextCursor = rows.pop()!.id;
    return {
      users: rows.map(({ openRouterKeyEncrypted, _count, ...u }) => ({
        ...u,
        hasOwnKey: openRouterKeyEncrypted !== null,
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
