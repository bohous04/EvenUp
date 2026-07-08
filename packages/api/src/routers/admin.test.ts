/** Admin router: gate, user flags, instance key, errors. */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, testPrisma, testSecretBox, resetDb } from '../test/harness.js';

async function makeAdmin(email: string) {
  const user = await createTestUser(email);
  await testPrisma.user.update({ where: { id: user.id }, data: { isAdmin: true } });
  return user;
}

describe('admin router', () => {
  beforeEach(resetDb);

  it('rejects non-admins with FORBIDDEN', async () => {
    const nonAdmin = await createTestUser('bob@example.com');
    const caller = makeCaller(nonAdmin);
    await expect(caller.admin.listUsers()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lists users without leaking key material and reflects hasOwnKey', async () => {
    const admin = await makeAdmin('admin@example.com');
    const other = await createTestUser('carol@example.com');
    await testPrisma.user.update({
      where: { id: other.id },
      data: { openRouterKeyEncrypted: testSecretBox.encrypt('sk-or-secret') },
    });

    const res = await makeCaller(admin).admin.listUsers();
    const carol = res.users.find((u) => u.email === 'carol@example.com');
    expect(carol?.hasOwnKey).toBe(true);
    // No encrypted key field is present on any returned user.
    expect(JSON.stringify(res.users)).not.toContain('openRouterKeyEncrypted');
    expect(JSON.stringify(res.users)).not.toContain('sk-or-secret');
  });

  it('grants VIP to another user', async () => {
    const admin = await makeAdmin('admin@example.com');
    const other = await createTestUser('carol@example.com');
    await makeCaller(admin).admin.setVip({ userId: other.id, isVip: true });
    const updated = await testPrisma.user.findUniqueOrThrow({ where: { id: other.id } });
    expect(updated.isVip).toBe(true);
  });

  it('refuses to let an admin change their own admin status (no lockout)', async () => {
    const admin = await makeAdmin('admin@example.com');
    await expect(
      makeCaller(admin).admin.setAdmin({ userId: admin.id, isAdmin: false }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const still = await testPrisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(still.isAdmin).toBe(true);
  });

  it('stores the instance key encrypted and never returns it', async () => {
    const admin = await makeAdmin('admin@example.com');
    const caller = makeCaller(admin);
    expect((await caller.admin.getInstanceConfig()).hasKey).toBe(false);

    await caller.admin.setInstanceOpenRouterKey({ apiKey: 'sk-or-instance-secret' });
    const cfg = await caller.admin.getInstanceConfig();
    expect(cfg.hasKey).toBe(true);
    expect(JSON.stringify(cfg)).not.toContain('sk-or-instance-secret');

    // Encrypted at rest, decryptable to the original.
    const row = await testPrisma.instanceConfig.findUniqueOrThrow({ where: { id: 'singleton' } });
    expect(row.openRouterKeyEncrypted).not.toBe('sk-or-instance-secret');
    expect(testSecretBox.decrypt(row.openRouterKeyEncrypted!)).toBe('sk-or-instance-secret');

    await caller.admin.clearInstanceOpenRouterKey();
    expect((await caller.admin.getInstanceConfig()).hasKey).toBe(false);
  });

  it('disables a user: sets disabledAt and drops their sessions', async () => {
    const admin = await makeAdmin('admin@example.com');
    const other = await createTestUser('carol@example.com');
    await testPrisma.session.create({
      data: {
        userId: other.id,
        token: 'tok-disable-1',
        expiresAt: new Date(Date.now() + 1_000_000),
      },
    });

    await makeCaller(admin).admin.setDisabled({ userId: other.id, disabled: true });
    const updated = await testPrisma.user.findUniqueOrThrow({ where: { id: other.id } });
    expect(updated.disabledAt).not.toBeNull();
    expect(await testPrisma.session.count({ where: { userId: other.id } })).toBe(0);
  });

  it('refuses to disable or delete yourself', async () => {
    const admin = await makeAdmin('admin@example.com');
    await expect(
      makeCaller(admin).admin.setDisabled({ userId: admin.id, disabled: true }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(makeCaller(admin).admin.deleteUser({ userId: admin.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('deletes another user', async () => {
    const admin = await makeAdmin('admin@example.com');
    const other = await createTestUser('carol@example.com');
    await makeCaller(admin).admin.deleteUser({ userId: other.id });
    expect(await testPrisma.user.findUnique({ where: { id: other.id } })).toBeNull();
  });

  it('lists recent error-log rows for admins', async () => {
    const admin = await makeAdmin('admin@example.com');
    await testPrisma.errorLog.create({
      data: { source: 'ocr', code: 'UNPROCESSABLE_CONTENT', message: 'boom', path: 'ocr.scan' },
    });
    const res = await makeCaller(admin).admin.listErrors();
    expect(res.errors[0]?.message).toBe('boom');
    expect(res.errors[0]?.path).toBe('ocr.scan');
  });
});
