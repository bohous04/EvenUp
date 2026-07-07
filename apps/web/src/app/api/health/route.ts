import { prisma } from '@evenup/db';

/** Health check for Coolify + the post-deploy smoke test (PRD §9.6, §11.2). */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', db: 'up' });
  } catch {
    return Response.json({ status: 'degraded', db: 'down' }, { status: 503 });
  }
}
