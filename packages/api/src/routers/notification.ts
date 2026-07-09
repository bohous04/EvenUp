/** Notification preferences: global opt-out + per-group mute (FR-11.2). */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { assertGroupAccess } from '../access.js';

export const notificationRouter = router({
  /** The account-wide switch. When off, nothing is ever sent, group mute or not. */
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { notificationsEnabled: true },
    });
    return { notificationsEnabled: user.notificationsEnabled };
  }),

  setEnabled: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { notificationsEnabled: input.enabled },
      });
      return { notificationsEnabled: input.enabled };
    }),

  /** Per-group mute. Absence of a preference row means "not muted". */
  getGroupMute: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      const pref = await ctx.prisma.notificationPreference.findUnique({
        where: { userId_groupId: { userId: ctx.user.id, groupId: input.groupId } },
        select: { muted: true },
      });
      return { muted: pref?.muted ?? false };
    }),

  setGroupMute: protectedProcedure
    .input(z.object({ groupId: z.string(), muted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      await ctx.prisma.notificationPreference.upsert({
        where: { userId_groupId: { userId: ctx.user.id, groupId: input.groupId } },
        // A first-time row starts its watermark now: un-muting a group must not
        // dump every expense since the group was created into one digest.
        create: {
          userId: ctx.user.id,
          groupId: input.groupId,
          muted: input.muted,
          lastDigestAt: new Date(),
        },
        update: { muted: input.muted },
      });
      return { muted: input.muted };
    }),
});
