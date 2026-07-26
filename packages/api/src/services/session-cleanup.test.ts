import { beforeEach, describe, expect, it } from 'vitest';
import { createTestUser, testPrisma, resetDb } from '../test/harness.js';
import { purgeExpiredSessions } from './session-cleanup.js';

describe('purgeExpiredSessions', () => {
  beforeEach(resetDb);

  it('deletes expired sessions and keeps live ones', async () => {
    const u = await createTestUser('a@example.com');
    const now = new Date('2026-07-26T00:00:00Z');
    await testPrisma.session.createMany({
      data: [
        {
          userId: u.id,
          token: 'old',
          expiresAt: new Date('2026-07-01T00:00:00Z'),
          ipAddress: '1.2.3.4',
          userAgent: 'x',
        },
        { userId: u.id, token: 'live', expiresAt: new Date('2026-08-01T00:00:00Z') },
      ],
    });

    const { deleted } = await purgeExpiredSessions(testPrisma, now);

    expect(deleted).toBe(1);
    const left = await testPrisma.session.findMany();
    expect(left).toHaveLength(1);
    expect(left[0]!.token).toBe('live');
  });

  it('treats a session expiring exactly now as still live', async () => {
    // `lt`, not `lte` — a session is dead only once its expiry has passed, and
    // this pins the boundary so a later refactor to `lte` cannot silently log
    // someone out at the instant their session was still valid.
    const u = await createTestUser('boundary@example.com');
    const now = new Date('2026-07-26T00:00:00Z');
    await testPrisma.session.create({
      data: { userId: u.id, token: 'exact', expiresAt: now },
    });

    const { deleted } = await purgeExpiredSessions(testPrisma, now);

    expect(deleted).toBe(0);
    expect(await testPrisma.session.count()).toBe(1);
  });

  it('takes the ip address and user agent with it — the reason this exists', async () => {
    const u = await createTestUser('pii@example.com');
    await testPrisma.session.create({
      data: {
        userId: u.id,
        token: 'stale',
        expiresAt: new Date('2026-01-01T00:00:00Z'),
        ipAddress: '203.0.113.7',
        userAgent: 'Mozilla/5.0',
      },
    });

    await purgeExpiredSessions(testPrisma, new Date('2026-07-26T00:00:00Z'));

    expect(await testPrisma.session.findMany({ where: { ipAddress: '203.0.113.7' } })).toEqual([]);
  });
});
