/**
 * Shared guard for the scheduled-task endpoints (receipt cleanup,
 * notifications). Coolify calls them over HTTP, so the only thing standing
 * between a cron route and the open internet is this bearer token.
 *
 * Comparison is constant-time in the token bytes: a naive `===` short-circuits
 * on the first differing byte and leaks the secret one character at a time to
 * anyone who can measure response latency.
 */
import 'server-only';
import { env } from './env.js';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * `null` when the caller is authorized; otherwise the 401 to return. An unset
 * `CRON_SECRET` denies everything rather than opening the endpoint up.
 */
export function rejectUnauthorizedCron(req: Request): Response | null {
  const secret = env.cronSecret;
  const header = req.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secret || !timingSafeEqual(provided, secret)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
