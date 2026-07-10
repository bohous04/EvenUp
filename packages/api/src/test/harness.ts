/**
 * Integration-test harness: a shared Prisma client against the ephemeral test
 * database, a tRPC caller factory, and a DB reset helper. Requires
 * `DATABASE_URL` to point at a migrated Postgres (the CI Postgres service, or a
 * throwaway container locally).
 */
import { createPrismaClient } from '@evenup/db';
import { appRouter } from '../root.js';
import { createContext, type AuthUser, type RateLimiter } from '../context.js';
import { createCallerFactory } from '../trpc.js';
import { createSecretBox } from '../crypto/secret-box.js';
import type { FetchLike } from '../ocr/openrouter-adapter.js';
import type { NotificationChannel } from '../notifications/types.js';
import type { ObjectStore } from '../storage/object-store.js';

// Deterministic 32-byte (64 hex) key — test-only.
const TEST_KEY = '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0';
export const testSecretBox = createSecretBox(TEST_KEY);

export const testPrisma = createPrismaClient(process.env.DATABASE_URL);

const callerFactory = createCallerFactory(appRouter);
type Caller = ReturnType<typeof callerFactory>;

export function makeCaller(
  user: AuthUser | null,
  opts: {
    ocrFetch?: FetchLike;
    objectStore?: ObjectStore;
    fxFetch?: FetchLike;
    ocrRateLimit?: RateLimiter;
    notificationChannels?: readonly NotificationChannel[];
  } = {},
): Caller {
  return callerFactory(
    createContext({
      prisma: testPrisma,
      user,
      secretBox: testSecretBox,
      ocrFetch: opts.ocrFetch,
      objectStore: opts.objectStore,
      fxFetch: opts.fxFetch,
      ocrRateLimit: opts.ocrRateLimit,
      notificationChannels: opts.notificationChannels,
    }),
  );
}

export async function createTestUser(email = 'olivia@example.com'): Promise<AuthUser> {
  const user = await testPrisma.user.upsert({
    where: { email },
    create: { email, name: email.split('@')[0] },
    update: {},
  });
  return { id: user.id, email: user.email };
}

/** Wipe all data between tests (children cascade from groups/users). */
export async function resetDb(): Promise<void> {
  await testPrisma.notificationDelivery.deleteMany();
  await testPrisma.notificationPreference.deleteMany();
  await testPrisma.errorLog.deleteMany();
  await testPrisma.instanceConfig.deleteMany();
  await testPrisma.activityLog.deleteMany();
  await testPrisma.transaction.deleteMany();
  await testPrisma.invite.deleteMany();
  await testPrisma.receipt.deleteMany();
  await testPrisma.bankDetail.deleteMany();
  await testPrisma.member.deleteMany();
  await testPrisma.group.deleteMany();
  await testPrisma.account.deleteMany();
  await testPrisma.session.deleteMany();
  await testPrisma.fxRate.deleteMany();
  await testPrisma.user.deleteMany();
}
