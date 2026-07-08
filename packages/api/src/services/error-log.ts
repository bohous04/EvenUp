/**
 * Best-effort server error logging for the admin dashboard. A tRPC middleware
 * records failed calls here; recording must never throw or mask the original
 * error. Routine client-side outcomes (auth, validation, not-found, rate limit,
 * "add your key") are skipped so the log surfaces things worth fixing —
 * unexpected failures and OCR failures.
 */
import type { PrismaClient } from '@evenup/db';

const SKIP_CODES = new Set([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'BAD_REQUEST',
  'NOT_FOUND',
  'TOO_MANY_REQUESTS',
  'PRECONDITION_FAILED',
  'CONFLICT',
]);

/** Whether a tRPC error code is worth recording (i.e. not a routine client error). */
export function shouldLogError(code: string): boolean {
  return !SKIP_CODES.has(code);
}

export async function logError(
  prisma: PrismaClient,
  opts: { userId: string | null; path?: string; code: string; message: string },
): Promise<void> {
  try {
    const source = opts.path ? (opts.path.split('.')[0] ?? 'unknown') : 'unknown';
    await prisma.errorLog.create({
      data: {
        userId: opts.userId,
        source,
        code: opts.code,
        message: opts.message.slice(0, 2000),
        path: opts.path ?? null,
      },
    });
  } catch (err) {
    // Logging is best-effort — a failure here must never surface to the caller.
    console.warn('[error-log] failed to record error', err);
  }
}
