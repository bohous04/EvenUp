import { consumeMagicLink } from '@/server/magic-link-store';
import { env } from '@/server/env';

/**
 * Dev/E2E-only: return the most recent magic link for an email so tests can sign
 * in without a mail transport. Disabled unless AUTH_DEV_ECHO=true.
 */
export async function GET(req: Request) {
  if (!env.authDevEcho) {
    return Response.json({ error: 'disabled' }, { status: 404 });
  }
  const email = new URL(req.url).searchParams.get('email');
  if (!email) return Response.json({ error: 'email required' }, { status: 400 });
  const url = consumeMagicLink(email);
  if (!url) return Response.json({ error: 'no link' }, { status: 404 });
  return Response.json({ url });
}
