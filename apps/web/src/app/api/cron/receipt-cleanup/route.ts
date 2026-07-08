import { prisma } from '@evenup/db';
import { cleanupExpiredReceipts } from '@evenup/api';
import { env } from '@/server/env';
import { getObjectStore } from '@/server/object-store';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request) {
  const secret = env.cronSecret;
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!secret || !timingSafeEqual(provided, secret)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { deleted } = await cleanupExpiredReceipts({
    prisma,
    objectStore: getObjectStore(),
    retentionDays: env.receiptRetentionDays,
    now: new Date(),
  });
  return Response.json({ deleted });
}
