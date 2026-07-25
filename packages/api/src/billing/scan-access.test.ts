import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestUser, testPrisma, resetDb } from '../test/harness.js';
import { loadEntitlement } from './scan-access.js';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('loadEntitlement', () => {
  beforeEach(resetDb);

  it('allows any user when billing is disabled', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const u = await createTestUser('a@example.com');
    const e = await loadEntitlement(testPrisma, u.id, new Date());
    expect(e).toMatchObject({ allow: true, consume: 'NONE' });
  });

  it('refuses an unfunded user when billing is enabled', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const u = await createTestUser('a@example.com');
    const e = await loadEntitlement(testPrisma, u.id, new Date());
    expect(e).toMatchObject({ allow: false });
  });

  it('uses credits when the user has a balance', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const u = await createTestUser('a@example.com');
    await testPrisma.user.update({ where: { id: u.id }, data: { creditBalance: 1 } });
    const e = await loadEntitlement(testPrisma, u.id, new Date());
    expect(e).toMatchObject({ allow: true, consume: 'CREDIT', mayStoreImage: false });
  });
});
