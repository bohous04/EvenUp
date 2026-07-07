/**
 * tRPC request context: the Prisma client, the authenticated user (if any —
 * participation never requires an account, FR-1.1), and the secret box used to
 * encrypt BYO keys and IBANs at rest.
 */
import type { PrismaClient } from '@evenup/db';
import type { Locale } from '@evenup/i18n';
import type { SecretBox } from './crypto/secret-box.js';
import type { FetchLike } from './ocr/openrouter-adapter.js';

export interface AuthUser {
  readonly id: string;
  readonly email: string;
}

export interface Context {
  readonly prisma: PrismaClient;
  readonly user: AuthUser | null;
  readonly secretBox: SecretBox;
  readonly locale: Locale;
  /** Injectable fetch for the OCR adapter (fixtures in tests). */
  readonly ocrFetch?: FetchLike;
}

export interface CreateContextOptions {
  readonly prisma: PrismaClient;
  readonly user?: AuthUser | null;
  readonly secretBox: SecretBox;
  readonly locale?: Locale;
  readonly ocrFetch?: FetchLike;
}

/** Build a context (used by both the HTTP handler and integration tests). */
export function createContext(opts: CreateContextOptions): Context {
  return {
    prisma: opts.prisma,
    user: opts.user ?? null,
    secretBox: opts.secretBox,
    locale: opts.locale ?? 'cs',
    ocrFetch: opts.ocrFetch,
  };
}
