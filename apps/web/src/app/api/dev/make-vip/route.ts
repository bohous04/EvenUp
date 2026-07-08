import { prisma } from '@evenup/db';
import { env } from '@/server/env';

/**
 * Dev/E2E-only: mark a user VIP so tests can exercise the VIP-gated OCR / receipt
 * photo storage paths without an admin round-trip. Disabled unless
 * AUTH_DEV_ECHO=true, so it is never reachable in production.
 */
export async function POST(req: Request) {
  if (!env.authDevEcho) {
    return Response.json({ error: 'disabled' }, { status: 404 });
  }
  const email = new URL(req.url).searchParams.get('email');
  if (!email) return Response.json({ error: 'email required' }, { status: 400 });
  await prisma.user.update({ where: { email }, data: { isVip: true } });
  return Response.json({ ok: true });
}
