/**
 * tRPC initialization: procedures, routers, and the auth/group-access
 * middleware shared by every router. superjson is the transformer so `Date`
 * values cross the wire intact.
 */
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { Context } from './context.js';
import { logError, shouldLogError } from './services/error-log.js';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const middleware = t.middleware;
export const createCallerFactory = t.createCallerFactory;

/**
 * Outermost middleware: record failing calls to the error log (best-effort) so
 * the admin dashboard can surface them. It never alters the outcome.
 */
const errorLogging = t.middleware(async ({ ctx, path, next }) => {
  const result = await next();
  if (!result.ok) {
    const code = result.error.code ?? 'INTERNAL_SERVER_ERROR';
    if (shouldLogError(code)) {
      const cause = result.error.cause;
      const message =
        cause instanceof Error && cause.message
          ? `${result.error.message} — ${cause.message}`
          : result.error.message;
      await logError(ctx.prisma, { userId: ctx.user?.id ?? null, path, code, message });
    }
  }
  return result;
});

/** Base procedure with error logging; everything builds on it. */
const loggedProcedure = t.procedure.use(errorLogging);

export const publicProcedure = loggedProcedure;

/** Requires an authenticated user. */
export const protectedProcedure = loggedProcedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Requires the authenticated user to be an (enabled) instance admin. */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { isAdmin: true, disabledAt: true },
  });
  if (!user?.isAdmin || user.disabledAt) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next();
});
