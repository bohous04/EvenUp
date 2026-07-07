/**
 * @evenup/db — Prisma client and schema types.
 *
 * Exposes a single shared `PrismaClient` instance (cached on `globalThis` in
 * development to survive HMR) plus a `createPrismaClient` factory for tests that
 * need an isolated client against an ephemeral database.
 */
import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export { toMinor, fromMinor } from './money.js';

export function createPrismaClient(datasourceUrl?: string): PrismaClient {
  return new PrismaClient(
    datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : undefined,
  );
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
