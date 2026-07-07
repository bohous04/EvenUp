/**
 * Group access control. A user may act on a group if they created it or are
 * linked to one of its members. Admin-only actions additionally require an
 * ADMIN member link (or being the creator). (FR-2.6)
 */
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@evenup/db';
import type { AuthUser } from './context.js';

export async function assertGroupAccess(
  prisma: PrismaClient,
  user: AuthUser,
  groupId: string,
): Promise<void> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      createdById: true,
      members: { where: { userId: user.id }, select: { id: true } },
    },
  });
  if (!group) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
  }
  if (group.createdById !== user.id && group.members.length === 0) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You are not a member of this group' });
  }
}

export async function assertGroupAdmin(
  prisma: PrismaClient,
  user: AuthUser,
  groupId: string,
): Promise<void> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      createdById: true,
      members: { where: { userId: user.id, role: 'ADMIN' }, select: { id: true } },
    },
  });
  if (!group) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
  }
  if (group.createdById !== user.id && group.members.length === 0) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
}
