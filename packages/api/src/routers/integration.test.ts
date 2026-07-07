/**
 * Integration tests for the tRPC API against an ephemeral Postgres (PRD §10.1).
 * Covers the critical journey: create group -> add members -> record expenses in
 * each split type -> balances + debt minimization -> SPAYD QR -> mark settled,
 * plus invite-claim, OCR (mocked OpenRouter), and access control.
 */
import { beforeAll, beforeEach, describe, expect, it, test, vi } from 'vitest';
import { makeCaller, createTestUser, resetDb, testPrisma } from '../test/harness.js';
import type { FetchLike } from '../ocr/openrouter-adapter.js';
import { Prisma } from '@evenup/db';

beforeAll(async () => {
  // Fail fast with a clear message if the DB is not reachable/migrated.
  await testPrisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
});

async function seedGroupWithMembers() {
  const olivia = await createTestUser('olivia@example.com');
  const caller = makeCaller(olivia);
  const group = await caller.group.create({
    name: 'Tatry 2026',
    template: 'TRIP',
    baseCurrency: 'CZK',
  });
  const creatorMember = group.members[0]!;
  const petr = await caller.member.add({ groupId: group.id, displayName: 'Petr Svoboda' });
  const jana = await caller.member.add({ groupId: group.id, displayName: 'Jana Dvořáková' });
  return { olivia, caller, group, members: { olivia: creatorMember, petr, jana } };
}

describe('group & member lifecycle', () => {
  test('creating a group adds the creator as an ADMIN member with initials + color', async () => {
    const { group } = await seedGroupWithMembers();
    const admin = group.members[0]!;
    expect(admin.role).toBe('ADMIN');
    expect(admin.initials).toMatch(/^[A-Z]{1,2}$/);
    expect(admin.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('members get distinct auto-assigned colors', async () => {
    const { members } = await seedGroupWithMembers();
    const colors = new Set([members.olivia.color, members.petr.color, members.jana.color]);
    expect(colors.size).toBe(3);
  });
});

describe('expenses, balances and debt minimization', () => {
  test('equal-split expense produces correct balances and a single minimized payment', async () => {
    const { caller, group, members } = await seedGroupWithMembers();
    // Olivia pays 900 CZK, split equally among the three.
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Chata',
      currency: 'CZK',
      date: new Date('2026-06-22'),
      payers: [{ memberId: members.olivia.id, amountMinorUnits: 90000 }],
      split: {
        type: 'EQUAL',
        members: [
          { memberId: members.olivia.id },
          { memberId: members.petr.id },
          { memberId: members.jana.id },
        ],
      },
    });

    const { balances, payments, simplified } = await caller.balance.get({ groupId: group.id });
    const byName = Object.fromEntries(balances.map((b) => [b.displayName, b.balanceMinorUnits]));
    expect(byName['olivia']).toBe(60000); // paid 90000, owes 30000
    expect(byName['Petr Svoboda']).toBe(-30000);
    expect(byName['Jana Dvořáková']).toBe(-30000);
    expect(balances.reduce((a, b) => a + b.balanceMinorUnits, 0)).toBe(0);

    expect(simplified).toBe(true);
    expect(payments).toHaveLength(2); // n-1 for 3 non-zero members
    for (const p of payments) expect(p.toMemberId).toBe(members.olivia.id);
  });

  test('validates that payers sum to the total (FR-3.2)', async () => {
    const { caller, group, members } = await seedGroupWithMembers();
    await expect(
      caller.transaction.createExpense({
        groupId: group.id,
        title: 'Bad',
        currency: 'CZK',
        date: new Date(),
        payers: [{ memberId: members.olivia.id, amountMinorUnits: 100 }],
        split: { type: 'EXACT', members: [{ memberId: members.petr.id, exactMinorUnits: 90 }] },
      }),
    ).rejects.toThrow();
  });

  test('shares split allocates proportionally and stays cent-exact', async () => {
    const { caller, group, members } = await seedGroupWithMembers();
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Večeře',
      currency: 'CZK',
      date: new Date(),
      payers: [{ memberId: members.petr.id, amountMinorUnits: 10000 }],
      split: {
        type: 'SHARES',
        members: [
          { memberId: members.olivia.id, weight: 2 },
          { memberId: members.petr.id, weight: 1 },
          { memberId: members.jana.id, weight: 1 },
        ],
      },
    });
    const txns = await caller.transaction.list({ groupId: group.id });
    const split = txns[0]!.splits.map((s) => Number(s.computedMinorUnits)).sort((a, b) => b - a);
    expect(split).toEqual([5000, 2500, 2500]);
  });

  test('the Jayne->Kaylee chain collapses through a settled middle member', async () => {
    const { caller, group, members } = await seedGroupWithMembers();
    // Jana pays 600 for Petr only; Petr pays 600 for Olivia only -> chain.
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'A',
      currency: 'CZK',
      date: new Date(),
      payers: [{ memberId: members.jana.id, amountMinorUnits: 60000 }],
      split: { type: 'EXACT', members: [{ memberId: members.petr.id, exactMinorUnits: 60000 }] },
    });
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'B',
      currency: 'CZK',
      date: new Date(),
      payers: [{ memberId: members.petr.id, amountMinorUnits: 60000 }],
      split: { type: 'EXACT', members: [{ memberId: members.olivia.id, exactMinorUnits: 60000 }] },
    });
    const { payments } = await caller.balance.get({ groupId: group.id });
    // Chain Olivia -> Petr -> Jana: Petr nets to zero and drops out, so
    // Olivia pays Jana directly (the Jayne->Kaylee collapse).
    expect(payments).toEqual([
      { fromMemberId: members.olivia.id, toMemberId: members.jana.id, amountMinorUnits: 60000 },
    ]);
  });
});

describe('recurring expenses (FR-12.1)', () => {
  test('materializes due occurrences of a recurring template', async () => {
    const { caller, group, members } = await seedGroupWithMembers();
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
    const expense = await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Nájem',
      currency: 'CZK',
      date: threeDaysAgo,
      payers: [{ memberId: members.olivia.id, amountMinorUnits: 30000 }],
      split: {
        type: 'EQUAL',
        members: [{ memberId: members.olivia.id }, { memberId: members.petr.id }],
      },
    });

    await caller.transaction.setRecurrence({ transactionId: expense.id, interval: 'daily' });
    const result = await caller.transaction.materializeDue({ groupId: group.id });
    expect(result.created).toBeGreaterThanOrEqual(2);

    const txns = await caller.transaction.list({ groupId: group.id });
    const generated = txns.filter((t) => t.title === 'Nájem');
    expect(generated.length).toBe(result.created + 1); // template + copies

    // Running again is idempotent (cursor advanced) — nothing new is due.
    const again = await caller.transaction.materializeDue({ groupId: group.id });
    expect(again.created).toBe(0);
  });
});

describe('CSV import (Phase 4)', () => {
  test('imports base-currency rows and skips foreign-currency ones', async () => {
    const { caller, group, members } = await seedGroupWithMembers();
    const csv = [
      'Date,Description,Category,Cost,Currency',
      '2026-06-22,Groceries,groceries,300.00,CZK',
      '2026-06-23,Taxi,transport,50.00,EUR',
      'bad,Broken,,x,CZK',
    ].join('\n');

    const result = await caller.transaction.importCsv({
      groupId: group.id,
      csv,
      payerMemberId: members.olivia.id,
    });
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1); // the EUR row
    expect(result.errors).toHaveLength(1); // the bad date row

    const txns = await caller.transaction.list({ groupId: group.id });
    expect(txns.some((t) => t.title === 'Groceries')).toBe(true);

    // Equal split of 300 across 3 members -> each owes 100; payer nets +200.
    const { balances } = await caller.balance.get({ groupId: group.id });
    const byName = Object.fromEntries(balances.map((b) => [b.displayName, b.balanceMinorUnits]));
    expect(byName['Petr Svoboda']).toBe(-10000);
  });
});

describe('settlement: SPAYD + mark paid', () => {
  test('generates a SPAYD string once the creditor has an IBAN and settling zeros the balance', async () => {
    const { caller, group, members } = await seedGroupWithMembers();
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Oběd',
      currency: 'CZK',
      date: new Date(),
      payers: [{ memberId: members.olivia.id, amountMinorUnits: 30000 }],
      split: {
        type: 'EQUAL',
        members: [{ memberId: members.olivia.id }, { memberId: members.petr.id }],
      },
    });

    await caller.member.setBankDetail({
      memberId: members.olivia.id,
      iban: 'CZ6508000000192000145399',
      recipientName: 'Olivia',
    });

    const { spayd } = await caller.settlement.generateSpayd({
      groupId: group.id,
      toMemberId: members.olivia.id,
      amountMinorUnits: 15000,
      currency: 'CZK',
      message: 'Tatry 2026',
    });
    expect(spayd).toContain('SPD*1.0*ACC:CZ6508000000192000145399');
    expect(spayd).toContain('AM:150.00');
    expect(spayd).toContain('MSG:Tatry 2026');

    // Petr pays Olivia 150 -> balances settle to zero.
    await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: members.petr.id,
      toMemberId: members.olivia.id,
      amountMinorUnits: 15000,
      currency: 'CZK',
      method: 'QR',
    });
    const { payments } = await caller.balance.get({ groupId: group.id });
    expect(payments).toEqual([]);
  });

  test('the encrypted IBAN is never returned to the client', async () => {
    const { caller, members } = await seedGroupWithMembers();
    const detail = await caller.member.setBankDetail({
      memberId: members.olivia.id,
      iban: 'CZ6508000000192000145399',
    });
    expect(detail).not.toHaveProperty('ibanEncrypted');
    const stored = await testPrisma.bankDetail.findUniqueOrThrow({
      where: { memberId: members.olivia.id },
    });
    expect(stored.ibanEncrypted).not.toContain('CZ65');
  });
});

describe('invite claim (FR-1.3, FR-2.5)', () => {
  test('a second user claims a virtual member via an invite link', async () => {
    const { caller, group, members } = await seedGroupWithMembers();
    const invite = await caller.invite.create({ groupId: group.id });

    const preview = await makeCaller(null).invite.preview({ token: invite.token });
    expect(preview.groupName).toBe('Tatry 2026');
    expect(preview.members.map((m) => m.id)).toContain(members.petr.id);

    const petrUser = await createTestUser('petr@example.com');
    const claimed = await makeCaller(petrUser).invite.claim({
      token: invite.token,
      memberId: members.petr.id,
    });
    expect(claimed.userId).toBe(petrUser.id);
  });
});

describe('OCR (mocked OpenRouter, no live calls)', () => {
  const RECEIPT = JSON.stringify({
    merchant: 'Albert',
    currency: 'CZK',
    items: [{ name: 'Mléko', quantity: 1, totalPrice: 24.9 }],
    total: 24.9,
    confidence: 0.95,
  });

  /** Fake OpenRouter chat-completions response, extracted so storage tests can reuse it. */
  function makeOcrFetch(): FetchLike {
    return vi.fn(
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: RECEIPT } }] }), {
          status: 200,
        }),
    );
  }

  test('scan extracts items using the user BYO key and stores the receipt', async () => {
    const olivia = await createTestUser('olivia@example.com');
    const caller = makeCaller(olivia, { ocrFetch: makeOcrFetch() });
    const group = await caller.group.create({ name: 'G', baseCurrency: 'CZK' });
    await caller.user.setOpenRouterKey({ apiKey: 'sk-or-test-key' });

    const res = await caller.ocr.scan({
      groupId: group.id,
      imageDataUrl: 'data:image/jpeg;base64,AAAA',
    });
    expect(res.result.items[0]!.totalMinorUnits).toBe(2490);
    const receipt = await testPrisma.receipt.findUniqueOrThrow({ where: { id: res.receiptId } });
    expect(receipt.status).toBe('COMPLETED');
  });

  test('scan without an API key is rejected (manual entry remains available)', async () => {
    const olivia = await createTestUser('olivia@example.com');
    const caller = makeCaller(olivia);
    const group = await caller.group.create({ name: 'G', baseCurrency: 'CZK' });
    await expect(
      caller.ocr.scan({ groupId: group.id, imageDataUrl: 'data:image/jpeg;base64,AAAA' }),
    ).rejects.toThrow();
  });

  const RECEIPT_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

  test('uploads the receipt image and auto-deletes it after extraction (FR-5.8)', async () => {
    const puts: { key: string; bytes: Uint8Array }[] = [];
    const deletes: string[] = [];
    const store = {
      async putReceipt(key: string, bytes: Uint8Array) {
        puts.push({ key, bytes });
      },
      async deleteObject(key: string) {
        deletes.push(key);
      },
    };
    const olivia = await createTestUser('olivia@example.com');
    const caller = makeCaller(olivia, { ocrFetch: makeOcrFetch(), objectStore: store });
    const group = await caller.group.create({ name: 'R', baseCurrency: 'CZK' });
    await caller.user.setOpenRouterKey({ apiKey: 'sk-or-test-key' });

    const prevAutoDelete = process.env.RECEIPT_AUTO_DELETE;
    process.env.RECEIPT_AUTO_DELETE = 'true';
    try {
      const res = await caller.ocr.scan({
        groupId: group.id,
        imageDataUrl: `data:image/png;base64,${RECEIPT_PNG_BASE64}`,
      });

      expect(puts).toHaveLength(1);
      expect(puts[0]!.key).toMatch(/^receipts\//);
      expect(puts[0]!.key).toContain(`receipts/${group.id}/`);
      expect(puts[0]!.bytes.length).toBeGreaterThan(0);
      expect(Buffer.from(puts[0]!.bytes).equals(Buffer.from(RECEIPT_PNG_BASE64, 'base64'))).toBe(
        true,
      );
      expect(deletes).toEqual([puts[0]!.key]); // auto-deleted
      const receipt = await testPrisma.receipt.findUniqueOrThrow({ where: { id: res.receiptId } });
      expect(receipt.storageKey).toBe(''); // cleared after auto-delete
    } finally {
      if (prevAutoDelete === undefined) delete process.env.RECEIPT_AUTO_DELETE;
      else process.env.RECEIPT_AUTO_DELETE = prevAutoDelete;
    }
  });

  test('retains the receipt image when auto-delete is off (FR-5.8)', async () => {
    const puts: { key: string; bytes: Uint8Array }[] = [];
    const deletes: string[] = [];
    const store = {
      async putReceipt(key: string, bytes: Uint8Array) {
        puts.push({ key, bytes });
      },
      async deleteObject(key: string) {
        deletes.push(key);
      },
    };
    const olivia = await createTestUser('olivia@example.com');
    const caller = makeCaller(olivia, { ocrFetch: makeOcrFetch(), objectStore: store });
    const group = await caller.group.create({ name: 'R2', baseCurrency: 'CZK' });
    await caller.user.setOpenRouterKey({ apiKey: 'sk-or-test-key' });

    const prevAutoDelete = process.env.RECEIPT_AUTO_DELETE;
    process.env.RECEIPT_AUTO_DELETE = 'false';
    try {
      const res = await caller.ocr.scan({
        groupId: group.id,
        imageDataUrl: `data:image/png;base64,${RECEIPT_PNG_BASE64}`,
      });

      expect(puts).toHaveLength(1);
      expect(puts[0]!.key).toMatch(/^receipts\//);
      expect(puts[0]!.bytes.length).toBeGreaterThan(0);
      expect(Buffer.from(puts[0]!.bytes).equals(Buffer.from(RECEIPT_PNG_BASE64, 'base64'))).toBe(
        true,
      );
      expect(deletes).toEqual([]); // retained
      const receipt = await testPrisma.receipt.findUniqueOrThrow({ where: { id: res.receiptId } });
      expect(receipt.storageKey).toContain(`receipts/${group.id}/`);
    } finally {
      if (prevAutoDelete === undefined) delete process.env.RECEIPT_AUTO_DELETE;
      else process.env.RECEIPT_AUTO_DELETE = prevAutoDelete;
    }
  });

  test('a storage failure does not break OCR (best-effort, FR-5.8)', async () => {
    const store = {
      async putReceipt(): Promise<void> {
        throw new Error('s3 down');
      },
      async deleteObject(): Promise<void> {},
    };
    const olivia = await createTestUser('olivia@example.com');
    const caller = makeCaller(olivia, { ocrFetch: makeOcrFetch(), objectStore: store });
    const group = await caller.group.create({ name: 'R3', baseCurrency: 'CZK' });
    await caller.user.setOpenRouterKey({ apiKey: 'sk-or-test-key' });

    const prevAutoDelete = process.env.RECEIPT_AUTO_DELETE;
    process.env.RECEIPT_AUTO_DELETE = 'true';
    try {
      const res = await caller.ocr.scan({
        groupId: group.id,
        imageDataUrl: `data:image/png;base64,${RECEIPT_PNG_BASE64}`,
      });

      expect(res.result).toBeDefined();
      expect(res.receiptId).toBeDefined();
      const receipt = await testPrisma.receipt.findUniqueOrThrow({ where: { id: res.receiptId } });
      expect(receipt.storageKey).toBe('');
      expect(receipt.status).toBe('COMPLETED');
    } finally {
      if (prevAutoDelete === undefined) delete process.env.RECEIPT_AUTO_DELETE;
      else process.env.RECEIPT_AUTO_DELETE = prevAutoDelete;
    }
  });

  it('rate-limits OCR scans per user (§9.2)', async () => {
    const user = await createTestUser();
    const caller = makeCaller(user, { ocrRateLimit: { check: () => false } }); // always over the limit
    const group = await caller.group.create({ name: 'RL', baseCurrency: 'CZK' });
    await expect(
      caller.ocr.scan({ groupId: group.id, imageDataUrl: 'data:image/png;base64,AAAA' }),
    ).rejects.toThrow(/TOO_MANY_REQUESTS|Too many/);
  });
});

describe('FX resolution (FR-8.2, FR-8.5)', () => {
  it('auto-fetches + caches an FX rate for a foreign-currency expense (FR-8.2)', async () => {
    const user = await createTestUser();
    const caller = makeCaller(user, {
      fxFetch: async () =>
        ({ ok: true, json: async () => ({ rates: { CZK: 25 } }), text: async () => '' }) as Response,
    });
    const group = await caller.group.create({ name: 'Trip', baseCurrency: 'CZK' });
    const m = await caller.member.add({ groupId: group.id, displayName: 'Petr' });

    const created = await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Lanovka',
      currency: 'EUR',
      date: new Date('2026-06-22'),
      payers: [{ memberId: m.id, amountMinorUnits: 10000 }], // 100.00 EUR
      split: { type: 'EQUAL', members: [{ memberId: m.id }] },
    });
    expect(Number(created.baseMinorUnits)).toBe(250000); // 100 EUR * 25 = 2500 CZK
    const cached = await testPrisma.fxRate.findFirst({ where: { base: 'CZK', quote: 'EUR' } });
    expect(cached?.source).toBe('frankfurter');
  });

  it('falls back to the newest cached rate when the provider is down (FR-8.5)', async () => {
    const user = await createTestUser();
    await testPrisma.fxRate.create({
      data: {
        base: 'CZK',
        quote: 'EUR',
        rate: new Prisma.Decimal('24'),
        date: new Date('2026-06-01'),
        source: 'frankfurter',
      },
    });
    const caller = makeCaller(user, { fxFetch: async () => ({ ok: false }) as Response }); // provider down
    const group = await caller.group.create({ name: 'Trip2', baseCurrency: 'CZK' });
    const m = await caller.member.add({ groupId: group.id, displayName: 'Petr' });
    const created = await caller.transaction.createExpense({
      groupId: group.id,
      title: 'x',
      currency: 'EUR',
      date: new Date('2026-06-22'),
      payers: [{ memberId: m.id, amountMinorUnits: 10000 }],
      split: { type: 'EQUAL', members: [{ memberId: m.id }] },
    });
    expect(Number(created.baseMinorUnits)).toBe(240000); // uses the stale 24 rate
  });
});

describe('GDPR account deletion (FR-1.6)', () => {
  it('smart-deletes the account: solo group gone, shared group unlinked (FR-1.6)', async () => {
    const olivia = await createTestUser('olivia@example.com');
    const petr = await createTestUser('petr@example.com');

    // Solo group: only Olivia is linked.
    const oliviaCaller = makeCaller(olivia);
    const solo = await oliviaCaller.group.create({ name: 'Solo', baseCurrency: 'CZK' });

    // Shared group: Olivia creates, Petr joins via a claimed member, with an expense.
    const shared = await oliviaCaller.group.create({ name: 'Shared', baseCurrency: 'CZK' });
    const petrMember = await oliviaCaller.member.add({ groupId: shared.id, displayName: 'Petr' });
    await testPrisma.member.update({ where: { id: petrMember.id }, data: { userId: petr.id } });
    const oliviaMember = await testPrisma.member.findFirstOrThrow({
      where: { groupId: shared.id, userId: olivia.id },
    });
    await oliviaCaller.transaction.createExpense({
      groupId: shared.id, title: 'Dinner', currency: 'CZK', date: new Date(),
      payers: [{ memberId: oliviaMember.id, amountMinorUnits: 20000 }],
      split: { type: 'EQUAL', members: [{ memberId: oliviaMember.id }, { memberId: petrMember.id }] },
    });

    // Olivia's member in the shared group has an IBAN on file -- PII that must
    // be purged even though the member row itself survives (deactivate+unlink).
    await oliviaCaller.member.setBankDetail({
      memberId: oliviaMember.id,
      iban: 'CZ6508000000192000145399',
      recipientName: 'Olivia',
    });

    // Second shared group: Petr is linked too, but Olivia's member here has no
    // transactions -- it should be hard-deleted while the group and Petr survive.
    const shared2 = await oliviaCaller.group.create({ name: 'Shared2', baseCurrency: 'CZK' });
    const petrMember2 = await oliviaCaller.member.add({ groupId: shared2.id, displayName: 'Petr' });
    await testPrisma.member.update({ where: { id: petrMember2.id }, data: { userId: petr.id } });
    const oliviaMember2 = await testPrisma.member.findFirstOrThrow({
      where: { groupId: shared2.id, userId: olivia.id },
    });

    await oliviaCaller.user.deleteAccount();

    expect(await testPrisma.group.findUnique({ where: { id: solo.id } })).toBeNull();
    const keptGroup = await testPrisma.group.findUnique({ where: { id: shared.id } });
    expect(keptGroup).not.toBeNull(); // shared group survives for Petr
    const oliviaMemberAfter = await testPrisma.member.findUnique({ where: { id: oliviaMember.id } });
    expect(oliviaMemberAfter?.isActive).toBe(false); // deactivated (had a transaction)
    expect(oliviaMemberAfter?.userId).toBeNull(); // unlinked
    expect(await testPrisma.user.findUnique({ where: { id: olivia.id } })).toBeNull(); // user gone

    // BankDetail PII is gone even though the member row itself survives.
    expect(await testPrisma.bankDetail.findUnique({ where: { memberId: oliviaMember.id } })).toBeNull();

    // Second shared group: unused member is hard-deleted; group + Petr survive.
    expect(await testPrisma.member.findUnique({ where: { id: oliviaMember2.id } })).toBeNull();
    const keptGroup2 = await testPrisma.group.findUnique({ where: { id: shared2.id } });
    expect(keptGroup2).not.toBeNull();
    expect(await testPrisma.member.findUnique({ where: { id: petrMember2.id } })).not.toBeNull();
  });
});

describe('activity log (FR-9.1, FR-9.2)', () => {
  it('lists activity and filters by action type (FR-9.1, FR-9.2)', async () => {
    const user = await createTestUser();
    const caller = makeCaller(user);
    const group = await caller.group.create({ name: 'Log', baseCurrency: 'CZK' });
    const m = await caller.member.add({ groupId: group.id, displayName: 'Petr' });
    await caller.transaction.createExpense({
      groupId: group.id, title: 'Chata', currency: 'CZK', date: new Date(),
      payers: [{ memberId: m.id, amountMinorUnits: 30000 }],
      split: { type: 'EQUAL', members: [{ memberId: m.id }] },
    });

    const all = await caller.activity.list({ groupId: group.id });
    const actions = all.items.map((i) => i.action);
    expect(actions).toContain('group.created');
    expect(actions).toContain('member.added');
    expect(actions).toContain('expense.created');

    const filtered = await caller.activity.list({ groupId: group.id, action: 'expense.created' });
    expect(filtered.items.every((i) => i.action === 'expense.created')).toBe(true);
    expect(filtered.items.length).toBe(1);
  });

  it('filters by memberId and returns the actor displayName for that member (FR-9.1)', async () => {
    const user = await createTestUser();
    const caller = makeCaller(user);
    const group = await caller.group.create({ name: 'Log2', baseCurrency: 'CZK' });
    const creatorMember = group.members[0]!;
    const m = await caller.member.add({ groupId: group.id, displayName: 'Petr' });
    await caller.transaction.createExpense({
      groupId: group.id, title: 'Chata', currency: 'CZK', date: new Date(),
      payers: [{ memberId: m.id, amountMinorUnits: 30000 }],
      split: { type: 'EQUAL', members: [{ memberId: m.id }] },
    });

    // Creator is the actor for group.created, member.added (Petr) and expense.created.
    const filtered = await caller.activity.list({ groupId: group.id, memberId: creatorMember.id });
    expect(filtered.items.length).toBeGreaterThan(0);
    for (const item of filtered.items) {
      expect(item.actorName).toBe(creatorMember.displayName);
    }
  });

  it('memberId filter for a virtual member (no linked user) returns no rows, not all rows (FR-9.1)', async () => {
    const user = await createTestUser();
    const caller = makeCaller(user);
    const group = await caller.group.create({ name: 'Log3', baseCurrency: 'CZK' });
    // A plain member.add creates a virtual member with userId null (not linked to a user).
    const virtualMember = await caller.member.add({ groupId: group.id, displayName: 'Petr' });
    expect(virtualMember.userId).toBeNull();

    // Sanity: there is activity in the group (group.created + member.added), but
    // none of it is attributable to the virtual member.
    const all = await caller.activity.list({ groupId: group.id });
    expect(all.items.length).toBeGreaterThan(0);

    const filtered = await caller.activity.list({ groupId: group.id, memberId: virtualMember.id });
    expect(filtered.items).toEqual([]);
  });

  it('logs edit events for member/group updates and group archive (FR-9.2)', async () => {
    const user = await createTestUser();
    const caller = makeCaller(user);
    const group = await caller.group.create({ name: 'Log4', baseCurrency: 'CZK' });
    const creatorMember = group.members[0]!;

    await caller.member.update({ memberId: creatorMember.id, displayName: 'Renamed' });
    await caller.group.update({ groupId: group.id, name: 'Renamed Group' });
    await caller.group.archive({ groupId: group.id, archived: true });

    const { items } = await caller.activity.list({ groupId: group.id });
    const actions = items.map((i) => i.action);
    expect(actions).toContain('member.updated');
    expect(actions).toContain('group.updated');
    expect(actions).toContain('group.archived');
  });

  it('paginates newest-first with a cursor that yields no overlap (FR-9.1)', async () => {
    const user = await createTestUser();
    const caller = makeCaller(user);
    const group = await caller.group.create({ name: 'Log5', baseCurrency: 'CZK' });
    // group.created, then three member.added rows -> at least 4 activity rows.
    await caller.member.add({ groupId: group.id, displayName: 'A' });
    await caller.member.add({ groupId: group.id, displayName: 'B' });
    await caller.member.add({ groupId: group.id, displayName: 'C' });

    const page1 = await caller.activity.list({ groupId: group.id, limit: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await caller.activity.list({
      groupId: group.id,
      limit: 1,
      cursor: page1.nextCursor!,
    });
    expect(page2.items).toHaveLength(1);

    // No overlap between pages.
    expect(page2.items[0]!.id).not.toBe(page1.items[0]!.id);
    // Newest-first: page 1's row was created no earlier than page 2's.
    expect(new Date(page1.items[0]!.createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(page2.items[0]!.createdAt).getTime(),
    );
    // Concretely: the most-recent action (adding "C" last) leads.
    expect(page1.items[0]!.action).toBe('member.added');
    expect((page1.items[0]!.payload as { name: string }).name).toBe('C');

    // Walking the feed one row at a time via nextCursor must visit every row
    // exactly once, in the same order as a single unpaginated call -- no
    // skipped rows and no duplicates at page boundaries.
    const full = await caller.activity.list({ groupId: group.id, limit: 100 });
    const walked: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await caller.activity.list({ groupId: group.id, limit: 1, cursor });
      walked.push(...page.items.map((i) => i.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(walked).toEqual(full.items.map((i) => i.id));
  });
});

describe('access control', () => {
  test('a non-member cannot read another group', async () => {
    const { group } = await seedGroupWithMembers();
    const mallory = await createTestUser('mallory@example.com');
    await expect(makeCaller(mallory).group.get({ groupId: group.id })).rejects.toThrow();
  });

  test('unauthenticated callers cannot create groups', async () => {
    await expect(
      makeCaller(null).group.create({ name: 'X', baseCurrency: 'CZK' }),
    ).rejects.toThrow();
  });
});
