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

  /**
   * Store this device's Expo push token (PRD §4.11).
   *
   * Upserts on `token`, not on `(userId, token)`: a shared phone that signs out
   * and into a second account must move to that account, or the first user goes
   * on receiving pushes on a device they no longer control.
   *
   * SECURITY: Accepted risk — possession of a token is treated as authority to
   * claim it, so anyone who obtained someone else's token could redirect that
   * user's pushes to their own account (a denial of notifications, plus the
   * ability to display their own content on that device). Binding to
   * `(userId, token)` instead would leave a resold or shared handset silently
   * receiving the previous owner's notifications, which is worse, and Expo's
   * own guidance is this upsert. The format check below at least keeps
   * arbitrary strings out of the table.
   */
  registerPushToken: protectedProcedure
    .input(
      z.object({
        // Expo tokens are `ExponentPushToken[...]` (or `ExpoPushToken[...]`).
        // Anchored so nothing else can be stored and later handed to Expo.
        token: z
          .string()
          .max(255)
          .regex(/^Ex(ponent)?PushToken\[[A-Za-z0-9_-]+\]$/, 'not an Expo push token'),
        platform: z.enum(['ios', 'android']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.pushToken.upsert({
        where: { token: input.token },
        create: { userId: ctx.user.id, token: input.token, platform: input.platform },
        update: { userId: ctx.user.id, platform: input.platform },
      });
      return { registered: true };
    }),

  /** Drop this device's token — called on sign-out and when push is switched off. */
  unregisterPushToken: protectedProcedure
    .input(z.object({ token: z.string().min(1).max(255) }))
    // Intentionally no format check here: a token stored before the rule
    // tightened must still be removable by the device that owns it.
    .mutation(async ({ ctx, input }) => {
      // Scoped to the caller so one account cannot unregister another's device.
      await ctx.prisma.pushToken.deleteMany({
        where: { token: input.token, userId: ctx.user.id },
      });
      return { registered: false };
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
