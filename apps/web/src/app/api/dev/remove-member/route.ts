import { prisma } from '@evenup/db';
import { env } from '@/server/env';

/**
 * Dev/E2E-only: deactivate an account-linked member without going through a
 * UI trigger. There is no click path anywhere in the app for `member.remove`
 * -- it exists only behind the API, reachable today from the admin/member
 * internals it protects (five review rounds; see member.ts) -- so tests that
 * need a "removed member reopens their invite link" state have no other way
 * to reach it. Mirrors /api/dev/make-vip for the same reason that one
 * exists. Disabled unless AUTH_DEV_ECHO=true, so it is never reachable in
 * production. Sets isActive: false directly rather than calling
 * member.remove, matching that procedure's own deactivate branch for an
 * account-linked member (userId !== null) without touching that file.
 */
export async function POST(req: Request) {
  if (!env.authDevEcho) {
    return Response.json({ error: 'disabled' }, { status: 404 });
  }
  const url = new URL(req.url);
  const groupId = url.searchParams.get('groupId');
  const email = url.searchParams.get('email');
  if (!groupId || !email) {
    return Response.json({ error: 'groupId and email required' }, { status: 400 });
  }
  const member = await prisma.member.findFirst({ where: { groupId, user: { email } } });
  if (!member) return Response.json({ error: 'member not found' }, { status: 404 });
  await prisma.member.update({ where: { id: member.id }, data: { isActive: false } });
  return Response.json({ ok: true });
}
