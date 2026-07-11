/** Group CRUD (PRD §4.2). */
import { z } from 'zod';
import { deriveInitials, colorForIndex } from '@evenup/core';
import type { Locale } from '@evenup/i18n';
import { router, protectedProcedure } from '../trpc.js';
import { createGroupInput, updateGroupInput } from '../schemas.js';
import { assertGroupAccess, assertGroupAdmin } from '../access.js';
import { logActivity } from '../services/activity.js';

/**
 * Starter categories seeded into every new group, in the creator's locale.
 * `iconName`s are semantic names from core's CUSTOM_CATEGORY_ICONS.
 */
const DEFAULT_CATEGORIES: Record<Locale, ReadonlyArray<{ name: string; iconName: string }>> = {
  cs: [
    { name: 'Jídlo', iconName: 'utensils' },
    { name: 'Doprava', iconName: 'car' },
    { name: 'Vstupné', iconName: 'ticket' },
  ],
  en: [
    { name: 'Food', iconName: 'utensils' },
    { name: 'Transport', iconName: 'car' },
    { name: 'Entry fees', iconName: 'ticket' },
  ],
};

/**
 * The linked-user fields for a member avatar: the image + the hide-photo
 * preference to resolve it (see `visibleAvatar`). Used everywhere a chip renders.
 */
const memberAvatarSelect = { image: true, hideProfilePhoto: true } as const;

/**
 * The roster view (`get`) also needs the linked account's email to show who is
 * connected — but that email is PII, so `get` only surfaces it to group admins
 * (and to the owning member); see the admin gate there.
 */
const memberUserSelect = { ...memberAvatarSelect, email: true } as const;

export const groupRouter = router({
  create: protectedProcedure.input(createGroupInput).mutation(async ({ ctx, input }) => {
    // Prefer the name entered at sign-up; fall back to the email local-part.
    const displayName = ctx.user.name?.trim() || ctx.user.email.split('@')[0] || 'Admin';
    const group = await ctx.prisma.group.create({
      data: {
        name: input.name,
        template: input.template,
        baseCurrency: input.baseCurrency,
        simplifyDebts: input.simplifyDebts,
        createdById: ctx.user.id,
        // The creator joins as the first ADMIN member (FR-2.6).
        members: {
          create: {
            displayName,
            initials: deriveInitials(displayName),
            color: colorForIndex(0),
            role: 'ADMIN',
            userId: ctx.user.id,
          },
        },
      },
      include: { members: true },
    });
    // Seed starter categories so a new group isn't empty (localized to creator).
    const defaults = DEFAULT_CATEGORIES[ctx.locale] ?? DEFAULT_CATEGORIES.cs;
    await ctx.prisma.groupCategory.createMany({
      data: defaults.map((c) => ({ groupId: group.id, name: c.name, iconName: c.iconName })),
    });
    await logActivity(ctx.prisma, group.id, ctx.user.id, 'group.created', { name: group.name });
    return group;
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.group.findMany({
      where: {
        OR: [{ createdById: ctx.user.id }, { members: { some: { userId: ctx.user.id } } }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        members: { include: { user: { select: memberAvatarSelect } } },
        _count: { select: { transactions: true } },
      },
    });
  }),

  get: protectedProcedure.input(z.object({ groupId: z.string() })).query(async ({ ctx, input }) => {
    await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
    const group = await ctx.prisma.group.findUniqueOrThrow({
      where: { id: input.groupId },
      include: {
        members: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: memberUserSelect } },
        },
      },
    });
    // A linked account's email is PII: expose it only to group admins (and to the
    // member who owns it). Everyone else still sees that a member is connected
    // (via `user` being non-null), just not the address.
    const viewerIsAdmin = group.members.some((m) => m.userId === ctx.user.id && m.role === 'ADMIN');
    return {
      ...group,
      members: group.members.map((m) =>
        m.user && !viewerIsAdmin && m.userId !== ctx.user.id
          ? { ...m, user: { ...m.user, email: null } }
          : m,
      ),
    };
  }),

  update: protectedProcedure.input(updateGroupInput).mutation(async ({ ctx, input }) => {
    await assertGroupAdmin(ctx.prisma, ctx.user, input.groupId);
    const updated = await ctx.prisma.group.update({
      where: { id: input.groupId },
      data: { name: input.name, simplifyDebts: input.simplifyDebts },
    });
    await logActivity(ctx.prisma, input.groupId, ctx.user.id, 'group.updated', {
      name: updated.name,
    });
    return updated;
  }),

  archive: protectedProcedure
    .input(z.object({ groupId: z.string(), archived: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupAdmin(ctx.prisma, ctx.user, input.groupId);
      const updated = await ctx.prisma.group.update({
        where: { id: input.groupId },
        data: { archivedAt: input.archived ? new Date() : null },
      });
      await logActivity(
        ctx.prisma,
        input.groupId,
        ctx.user.id,
        input.archived ? 'group.archived' : 'group.restored',
        { name: updated.name },
      );
      return updated;
    }),
});
