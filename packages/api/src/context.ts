/**
 * tRPC request context: the Prisma client, the authenticated user (if any —
 * participation never requires an account, FR-1.1), and the secret box used to
 * encrypt BYO keys and IBANs at rest.
 */
import type { PrismaClient } from '@evenup/db';
import type { Locale } from '@evenup/i18n';
import type { SecretBox } from './crypto/secret-box.js';
import type { FetchLike } from './ocr/openrouter-adapter.js';
import type { ObjectStore } from './storage/object-store.js';

/** Minimal rate-limiter shape (implemented in packages/api/src/rate-limit.ts). */
export interface RateLimiter {
  check(key: string): boolean;
}

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  /** Display name from sign-up (Better Auth `user.name`); may be empty. */
  readonly name?: string | null;
}

export interface Context {
  readonly prisma: PrismaClient;
  readonly user: AuthUser | null;
  readonly secretBox: SecretBox;
  readonly locale: Locale;
  /** Injectable fetch for the OCR adapter (fixtures in tests). */
  readonly ocrFetch?: FetchLike;
  /** Injectable object storage for receipt images (no-op/fake in tests). */
  readonly objectStore?: ObjectStore;
  /** Injectable fetch for the FX provider (fake in tests; unset disables auto-fetch). */
  readonly fxFetch?: FetchLike;
  /** Per-user rate limiter for OCR (fake in tests; unset disables limiting). */
  readonly ocrRateLimit?: RateLimiter;
}

export interface CreateContextOptions {
  readonly prisma: PrismaClient;
  readonly user?: AuthUser | null;
  readonly secretBox: SecretBox;
  readonly locale?: Locale;
  readonly ocrFetch?: FetchLike;
  readonly objectStore?: ObjectStore;
  readonly fxFetch?: FetchLike;
  readonly ocrRateLimit?: RateLimiter;
}

/** Build a context (used by both the HTTP handler and integration tests). */
export function createContext(opts: CreateContextOptions): Context {
  return {
    prisma: opts.prisma,
    user: opts.user ?? null,
    secretBox: opts.secretBox,
    locale: opts.locale ?? 'cs',
    ocrFetch: opts.ocrFetch,
    objectStore: opts.objectStore,
    fxFetch: opts.fxFetch,
    ocrRateLimit: opts.ocrRateLimit,
  };
}
