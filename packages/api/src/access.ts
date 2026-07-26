/**
 * Group access control. A user may act on a group if they created it or are
 * linked to one of its *active* members. Admin-only actions additionally
 * require an active ADMIN member link (or being the creator). (FR-2.6)
 *
 * The `isActive` filter is load-bearing, not cosmetic: a deactivated member
 * row is a removed person (`member.remove` deactivates rather than deletes an
 * account-linked row -- see member.ts). Matching on `userId` alone let a
 * removed member's row keep granting access, so removal revoked nothing --
 * they could still read/act on the group, and even reinstate themselves via
 * `member.update` (which itself only guards on `assertGroupAccess`). Requiring
 * `isActive: true` here is what actually makes removal revoke access.
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
      members: { where: { userId: user.id, isActive: true }, select: { id: true } },
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
      members: { where: { userId: user.id, role: 'ADMIN', isActive: true }, select: { id: true } },
    },
  });
  if (!group) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
  }
  if (group.createdById !== user.id && group.members.length === 0) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
}

/**
 * Non-throwing admin check, for call sites that branch on the answer rather
 * than refusing outright (e.g. member.merge, where a non-admin still has a
 * narrower legitimate path).
 */
export async function isGroupAdmin(
  prisma: PrismaClient,
  user: AuthUser,
  groupId: string,
): Promise<boolean> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      createdById: true,
      members: { where: { userId: user.id, role: 'ADMIN', isActive: true }, select: { id: true } },
    },
  });
  if (!group) return false;
  return group.createdById === user.id || group.members.length > 0;
}
