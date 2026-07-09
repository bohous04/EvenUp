/**
 * tRPC initialization: procedures, routers, and the auth/group-access
 * middleware shared by every router. superjson is the transformer so `Date`
 * values cross the wire intact.
 */
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { catalogs, t as translate, type MessageKey } from '@evenup/i18n';
import type { Context } from './context.js';
import { logError, shouldLogError } from './services/error-log.js';

// Reverse map English error text → its `errors.*` key, built once from the en
// catalog. Routers throw plain English messages (readable in code and logs);
// the formatter below rewrites them into the caller's locale.
const ERROR_KEY_BY_EN: Record<string, MessageKey> = Object.fromEntries(
  (Object.entries(catalogs.en) as [MessageKey, string][])
    .filter(([key]) => key.startsWith('errors.'))
    .map(([key, value]) => [value, key]),
);

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  // Localize known server error messages to the request's locale (defaults to
  // Czech). Unknown messages (Zod, internal) pass through untouched.
  errorFormatter({ shape, ctx }) {
    const key = ERROR_KEY_BY_EN[shape.message];
    if (key && ctx?.locale) return { ...shape, message: translate(ctx.locale, key) };
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
