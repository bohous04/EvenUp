/**
 * Group access control. A user may act on a group if they created it or are
 * linked to one of its *active* members. That is the whole model: groups are
 * flat, every member may do everything, and there is no admin tier. (FR-2.6)
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

/**
 * The caller's role in a group, or `null` if they are not an active member.
 *
 * The creator is not looked up as a member row: `group.create` seeds one, but a
 * creator whose own row was removed is still the creator, and the original
 * `assertGroupAccess` honoured that. Treating a creator as ADMIN here keeps
 * that behaviour instead of silently demoting them to "not a member".
 */
export async function groupRole(
  prisma: PrismaClient,
  user: AuthUser,
  groupId: string,
): Promise<'ADMIN' | 'MEMBER' | 'GUEST' | null> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      createdById: true,
      members: {
        where: { userId: user.id, isActive: true },
        select: { role: true },
        take: 1,
      },
    },
  });
  if (!group) return null;
  if (group.createdById === user.id) return 'ADMIN';
  return group.members[0]?.role ?? null;
}

export async function assertGroupAccess(
  prisma: PrismaClient,
  user: AuthUser,
  groupId: string,
): Promise<void> {
  const role = await groupRole(prisma, user, groupId);
  if (role === null) {
    // Distinguish "no such group" from "not a member": a caller who is neither
    // should not be able to probe which group ids exist.
    const exists = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } });
    throw exists
      ? new TRPCError({ code: 'FORBIDDEN', message: 'You are not a member of this group' })
      : new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
  }
}

/**
 * The write gate. Read-only GUESTs may read a group but never change it.
 *
 * Every mutating procedure must call THIS, not `assertGroupAccess`. The two are
 * separate on purpose: a guest's reads must keep working, so the read paths stay
 * on `assertGroupAccess` and only the writes move here. Enforcing "read-only"
 * in the UI alone would be no protection at all — the API is reachable directly
 * and the mobile client is not the only caller.
 */
export async function assertGroupWrite(
  prisma: PrismaClient,
  user: AuthUser,
  groupId: string,
): Promise<void> {
  const role = await groupRole(prisma, user, groupId);
  if (role === 'GUEST') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You are a guest in this group and cannot change it',
    });
  }
  if (role === null) {
    const exists = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } });
    throw exists
      ? new TRPCError({ code: 'FORBIDDEN', message: 'You are not a member of this group' })
      : new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
  }
}
