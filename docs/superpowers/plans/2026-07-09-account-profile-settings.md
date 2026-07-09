# Account Profile Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings-managed nickname (propagates to all linked group members) and a Czech-format bank account (encrypted at user level) that powers SPAYD QR payments in every group — per spec `docs/superpowers/specs/2026-07-09-account-profile-settings-design.md`.

**Architecture:** A pure CZ-account module in `@evenup/core` (parse/validate mod-11, convert to IBAN mod-97, mask); one new encrypted column on `User`; three user-router procedures + a payee-resolution change in `settlement.generateSpayd` (user-level account wins, legacy per-member `BankDetail` stays as read fallback); a new Profile card on the settings page; the group ⋯ menu loses its bank sheet. IBAN never appears in any UI string.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), Prisma/PostgreSQL, tRPC + zod, vitest (core units + API harness `makeCaller`/`createTestUser`/`testPrisma`/`testSecretBox`/`resetDb`), Next.js + Tailwind kit from the 2026-07-08 redesign, Playwright e2e.

## Global Constraints

- **IBAN never appears in UI copy, placeholders, or i18n values** — users see only the Czech `[prefix-]number/bankCode` format (spec §1). Internal conversion only.
- Encrypted-at-rest via the existing `ctx.secretBox` AES-GCM util; **raw account/IBAN values never reach the client** — `me` returns only `bankAccountMasked`.
- Money/domain logic in `@evenup/core` is pure and unit-tested; no new dependencies anywhere.
- UI uses the redesign kit (`Card`, `SectionLabel`, `Input`, `Button`, AA contrast: muted text = `text-zinc-500 dark:text-zinc-400`); SVG icons only, never emoji.
- Every new user-facing string gets a key in `packages/i18n/src/locales/cs.ts` (the `Messages` source type) AND `en.ts`.
- Commits conventional style; **NEVER add Co-Authored-By or any Claude attribution trailer**.
- Work from the worktree root `/Users/michallenert/My-Repositories/apps/EvenUp/.claude/worktrees/account-settings`; `git rev-parse --abbrev-ref HEAD` must print `worktree-account-settings` before every commit.
- **Environment:** dev Postgres for `prisma migrate dev` runs in the existing `evenup-dev-db` container → `DATABASE_URL='postgresql://evenup:evenup@localhost:55432/evenup'`. For e2e, recreate the throwaway DB first:
  `docker run -d --name evenup-e2e-db -e POSTGRES_USER=evenup -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=evenup -p 55433:5432 postgres:16` then `DATABASE_URL='postgresql://evenup:pass@localhost:55433/evenup' pnpm --filter @evenup/db exec prisma migrate deploy`. E2E env vars (build + run): `DATABASE_URL='postgresql://evenup:pass@localhost:55433/evenup' ENCRYPTION_KEY='0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0' BETTER_AUTH_SECRET='e2e-secret-000000000000000000000000' BETTER_AUTH_URL='http://localhost:3100' AUTH_DEV_ECHO='true' ADMIN_EMAILS='admin@example.com'` with `pnpm --filter @evenup/web build` then `pnpm --filter @evenup/web exec playwright test --project=chromium`.
- API vitest (`pnpm --filter @evenup/api test`) needs the dev database too — check `packages/api/src/test/harness.ts` for the `DATABASE_URL` it expects and export it accordingly (CI uses `postgresql://evenup:evenup@localhost:5432/evenup_test`; locally point it at the 55432 dev container, e.g. `DATABASE_URL='postgresql://evenup:evenup@localhost:55432/evenup_test'` after `createdb`-ing that schema via `docker exec evenup-dev-db createdb -U evenup evenup_test || true`, then `prisma migrate deploy` against it).

---

### Task 1: Core CZ-account module (parse, IBAN, mask)

**Files:**
- Create: `packages/core/src/bank/cz-account.ts`
- Create: `packages/core/src/bank/cz-account.test.ts`
- Modify: `packages/core/src/index.ts` (add export block)

**Interfaces:**
- Produces (later tasks import from `@evenup/core`):
  - `parseCzAccount(input: string): { prefix: string; number: string; bankCode: string } | null`
  - `czAccountToIban(input: string): string | null` (returns compact uppercase IBAN, e.g. `CZ6508000000192000145399`)
  - `maskCzAccount(input: string): string` (e.g. `…5399/0800`; returns `input` unchanged if unparseable)

- [ ] **Step 1: Write the failing tests**

`packages/core/src/bank/cz-account.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseCzAccount, czAccountToIban, maskCzAccount } from './cz-account.js';
import { isValidIban } from '../spayd/spayd.js';

describe('parseCzAccount', () => {
  it('parses prefix-number/bankCode', () => {
    expect(parseCzAccount('19-2000145399/0800')).toEqual({
      prefix: '19',
      number: '2000145399',
      bankCode: '0800',
    });
  });

  it('parses number/bankCode without prefix', () => {
    expect(parseCzAccount('2000145399/0800')).toEqual({
      prefix: '',
      number: '2000145399',
      bankCode: '0800',
    });
  });

  it('ignores whitespace noise', () => {
    expect(parseCzAccount(' 19 - 2000145399 / 0800 ')).not.toBeNull();
  });

  it('rejects a number failing the mod-11 checksum', () => {
    // 1000145399: weighted sum 115, 115 % 11 !== 0
    expect(parseCzAccount('1000145399/0800')).toBeNull();
  });

  it('rejects a prefix failing the mod-11 checksum', () => {
    // prefix 12: 1*2 + 2*1 = 4, 4 % 11 !== 0
    expect(parseCzAccount('12-2000145399/0800')).toBeNull();
  });

  it('rejects malformed inputs', () => {
    expect(parseCzAccount('')).toBeNull();
    expect(parseCzAccount('abc')).toBeNull();
    expect(parseCzAccount('2000145399')).toBeNull(); // missing bank code
    expect(parseCzAccount('2000145399/08000')).toBeNull(); // 5-digit bank code
    expect(parseCzAccount('2000145399/08x0')).toBeNull();
    expect(parseCzAccount('1-2000145399/0800/1')).toBeNull();
    expect(parseCzAccount('9/0800')).toBeNull(); // number must be 2–10 digits
  });
});

describe('czAccountToIban', () => {
  it('converts the reference account to the known IBAN', () => {
    // Same fixture the e2e suite asserts inside the SPAYD string.
    expect(czAccountToIban('19-2000145399/0800')).toBe('CZ6508000000192000145399');
  });

  it('produces a structurally valid IBAN for prefixless accounts', () => {
    const iban = czAccountToIban('2000145399/0800');
    expect(iban).not.toBeNull();
    expect(iban!.startsWith('CZ')).toBe(true);
    expect(iban).toHaveLength(24);
    expect(isValidIban(iban!)).toBe(true);
    expect(iban!.slice(4, 8)).toBe('0800');
    expect(iban!.endsWith('2000145399')).toBe(true);
  });

  it('returns null for invalid input', () => {
    expect(czAccountToIban('1000145399/0800')).toBeNull();
    expect(czAccountToIban('garbage')).toBeNull();
  });
});

describe('maskCzAccount', () => {
  it('masks to the last 4 digits + bank code', () => {
    expect(maskCzAccount('19-2000145399/0800')).toBe('…5399/0800');
  });

  it('returns unparseable input unchanged', () => {
    expect(maskCzAccount('nonsense')).toBe('nonsense');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @evenup/core test -- bank`
Expected: FAIL — `cz-account.js` module not found.

- [ ] **Step 3: Implement**

`packages/core/src/bank/cz-account.ts`:

```ts
/**
 * Czech domestic bank account numbers ("[prefix-]number/bankCode") — parsing
 * with the ČNB mod-11 weighted checksums, conversion to IBAN, and a display
 * mask. IBAN is an internal detail of SPAYD QR payloads and never surfaces in
 * the UI (design decision 2026-07-09).
 */

export interface CzAccount {
  prefix: string;
  number: string;
  bankCode: string;
}

/** ČNB weights, applied to the zero-padded digits left-to-right. */
const PREFIX_WEIGHTS = [10, 5, 8, 4, 2, 1];
const NUMBER_WEIGHTS = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1];

function mod11Ok(digits: string, weights: number[]): boolean {
  const padded = digits.padStart(weights.length, '0');
  const sum = [...padded].reduce((acc, ch, i) => acc + Number(ch) * weights[i]!, 0);
  return sum % 11 === 0;
}

export function parseCzAccount(input: string): CzAccount | null {
  const compact = input.replace(/\s+/g, '');
  const match = /^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/.exec(compact);
  if (!match) return null;
  const [, prefix = '', number, bankCode] = match;
  if (!mod11Ok(prefix || '0', PREFIX_WEIGHTS)) return null;
  if (!mod11Ok(number!, NUMBER_WEIGHTS)) return null;
  return { prefix, number: number!, bankCode: bankCode! };
}

/** Compact uppercase CZ IBAN (mod-97 check digits), or null when invalid. */
export function czAccountToIban(input: string): string | null {
  const account = parseCzAccount(input);
  if (!account) return null;
  const bban = account.bankCode + account.prefix.padStart(6, '0') + account.number.padStart(10, '0');
  // Check digits: move "CZ00" behind the BBAN, letters → numbers (C=12, Z=35),
  // then 98 - (big number mod 97). BigInt keeps the 30-digit arithmetic exact.
  const numeric = `${bban}123500`; // C→12, Z→35, 0, 0
  const check = 98n - (BigInt(numeric) % 97n);
  return `CZ${check.toString().padStart(2, '0')}${bban}`;
}

/** Display mask for the settings page: `…5399/0800`. */
export function maskCzAccount(input: string): string {
  const account = parseCzAccount(input);
  if (!account) return input;
  return `…${account.number.slice(-4)}/${account.bankCode}`;
}
```

Add to `packages/core/src/index.ts` (next to the spayd export block):

```ts
export {
  type CzAccount,
  parseCzAccount,
  czAccountToIban,
  maskCzAccount,
} from './bank/cz-account.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @evenup/core test -- bank`
Expected: PASS (all cases). Then the full core suite: `pnpm --filter @evenup/core test` — PASS, and `pnpm --filter @evenup/core lint && pnpm --filter @evenup/core typecheck`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bank packages/core/src/index.ts
git commit -m "feat(core): Czech account number parsing, IBAN conversion, display mask"
```

---

### Task 2: DB — `User.bankAccountEncrypted` column + migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (User model, after `openRouterKeyEncrypted`)
- Create: `packages/db/prisma/migrations/<timestamp>_user_bank_account/migration.sql` (generated)

**Interfaces:**
- Produces: `User.bankAccountEncrypted: string | null` available on the Prisma client for Tasks 3–4.

- [ ] **Step 1: Edit the schema**

In the `User` model, directly below the `openRouterKeyEncrypted` line, add:

```prisma
  bankAccountEncrypted String? // CZ account "[prefix-]number/bankCode" as entered, AES-GCM at rest (§9.2)
```

- [ ] **Step 2: Generate the migration against the dev DB**

```bash
DATABASE_URL='postgresql://evenup:evenup@localhost:55432/evenup' \
  pnpm --filter @evenup/db exec prisma migrate dev --name user_bank_account
pnpm --filter @evenup/db exec prisma generate
```

Expected: one new migration folder containing `ALTER TABLE "User" ADD COLUMN "bankAccountEncrypted" TEXT;`, and a regenerated client.

- [ ] **Step 3: Verify types see the column**

Run: `pnpm --filter @evenup/db typecheck && pnpm --filter @evenup/api typecheck`
Expected: PASS (nothing consumes it yet).

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma
git commit -m "feat(db): encrypted user-level bank account column"
```

---

### Task 3: API — profile procedures on the user router

**Files:**
- Modify: `packages/api/src/routers/user.ts`
- Create: `packages/api/src/routers/user-profile.test.ts`

**Interfaces:**
- Consumes: `parseCzAccount`, `maskCzAccount` from `@evenup/core` (Task 1); `deriveInitials` from `@evenup/core`; `logActivity` from `../services/activity.js` (existing, signature `logActivity(prisma, groupId, userId, action, payload)`).
- Produces (client-visible):
  - `user.updateProfile({ name: string })` — updates `User.name` + every member where `userId === ctx.user.id` (displayName + re-derived initials) + one `member.updated` activity per affected group; returns `{ ok: true, membersRenamed: number }`.
  - `user.setBankAccount({ account: string })` — validates via `parseCzAccount`, stores whitespace-stripped + encrypted; `BAD_REQUEST` with message `'Invalid account number'` when invalid; returns `{ ok: true, masked: string }`.
  - `user.clearBankAccount()` — nulls the column; returns `{ ok: true }`.
  - `user.me` additionally returns `bankAccountMasked: string | null` (and keeps returning `name`).

- [ ] **Step 1: Write the failing tests**

`packages/api/src/routers/user-profile.test.ts`:

```ts
/** User profile: nickname propagation + CZ bank account (spec 2026-07-09). */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, testPrisma, resetDb } from '../test/harness.js';

/** Create a group as `user` and return their auto-created linked member. */
async function createGroupWithLinkedMember(user: { id: string }, name: string) {
  const caller = makeCaller(user);
  const group = await caller.group.create({ name, template: 'TRIP', baseCurrency: 'CZK' });
  const member = await testPrisma.member.findFirstOrThrow({
    where: { groupId: group.id, userId: user.id },
  });
  return { group, member };
}

describe('user.updateProfile', () => {
  beforeEach(resetDb);

  it('renames the user and every linked member, re-deriving initials', async () => {
    const user = await createTestUser('nick@example.com');
    const a = await createGroupWithLinkedMember(user, 'Trip A');
    const b = await createGroupWithLinkedMember(user, 'Trip B');

    const res = await makeCaller(user).user.updateProfile({ name: 'Michal Novák' });
    expect(res).toMatchObject({ ok: true, membersRenamed: 2 });

    const updatedUser = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.name).toBe('Michal Novák');

    for (const m of [a.member, b.member]) {
      const updated = await testPrisma.member.findUniqueOrThrow({ where: { id: m.id } });
      expect(updated.displayName).toBe('Michal Novák');
      expect(updated.initials).toBe('MN');
    }
  });

  it('does not touch unlinked members and logs member.updated per group', async () => {
    const user = await createTestUser('nick2@example.com');
    const { group } = await createGroupWithLinkedMember(user, 'Trip');
    const virtual = await makeCaller(user).member.add({ groupId: group.id, displayName: 'Petr' });

    await makeCaller(user).user.updateProfile({ name: 'Nové Jméno' });

    const untouched = await testPrisma.member.findUniqueOrThrow({ where: { id: virtual.id } });
    expect(untouched.displayName).toBe('Petr');

    const activities = await testPrisma.activity.findMany({
      where: { groupId: group.id, action: 'member.updated' },
    });
    expect(activities).toHaveLength(1);
  });

  it('rejects an empty name', async () => {
    const user = await createTestUser('nick3@example.com');
    await expect(makeCaller(user).user.updateProfile({ name: '   ' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('user.setBankAccount / clearBankAccount / me', () => {
  beforeEach(resetDb);

  it('stores the account encrypted and me returns only the mask', async () => {
    const user = await createTestUser('acct@example.com');
    const caller = makeCaller(user);

    const res = await caller.user.setBankAccount({ account: ' 19 - 2000145399 / 0800 ' });
    expect(res).toEqual({ ok: true, masked: '…5399/0800' });

    const row = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.bankAccountEncrypted).not.toBeNull();
    expect(row.bankAccountEncrypted).not.toContain('2000145399'); // encrypted, not plaintext

    const me = await caller.user.me();
    expect(me.bankAccountMasked).toBe('…5399/0800');
    expect(JSON.stringify(me)).not.toContain('2000145399');
  });

  it('rejects an invalid account number', async () => {
    const user = await createTestUser('acct2@example.com');
    await expect(
      makeCaller(user).user.setBankAccount({ account: '1000145399/0800' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('clearBankAccount nulls the column and the mask', async () => {
    const user = await createTestUser('acct3@example.com');
    const caller = makeCaller(user);
    await caller.user.setBankAccount({ account: '19-2000145399/0800' });
    await caller.user.clearBankAccount();

    const row = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.bankAccountEncrypted).toBeNull();
    expect((await caller.user.me()).bankAccountMasked).toBeNull();
  });
});
```

Note: check `packages/api/src/test/harness.js` exports and the `activity` model name (`testPrisma.activity` vs `activityLog`) before running — align the test with whatever `logActivity` writes (`grep -n "prisma\." packages/api/src/services/activity.ts`). If `member.add` returns the member differently, adapt the `virtual.id` access; keep assertions identical.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @evenup/api test -- user-profile`
Expected: FAIL — `updateProfile` / `setBankAccount` / `clearBankAccount` not found on the router.

- [ ] **Step 3: Implement in `user.ts`**

Add imports at the top:

```ts
import { TRPCError } from '@trpc/server';
import { deriveInitials, parseCzAccount, maskCzAccount } from '@evenup/core';
import { logActivity } from '../services/activity.js';
```

In `me`, add `bankAccountEncrypted: true` to the `select`, then change the return to:

```ts
    const { openRouterKeyEncrypted, bankAccountEncrypted, ...rest } = user;
    return {
      ...rest,
      hasOpenRouterKey: openRouterKeyEncrypted !== null,
      bankAccountMasked:
        bankAccountEncrypted !== null
          ? maskCzAccount(ctx.secretBox.decrypt(bankAccountEncrypted))
          : null,
    };
```

Add the three procedures (after `updateSettings`):

```ts
  /** Rename the account AND every group member linked to it (spec 2026-07-09 §4). */
  updateProfile: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const linked = await ctx.prisma.member.findMany({
        where: { userId: ctx.user.id },
        select: { id: true, groupId: true },
      });
      await ctx.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: ctx.user.id }, data: { name: input.name } });
        if (linked.length > 0) {
          await tx.member.updateMany({
            where: { userId: ctx.user.id },
            data: { displayName: input.name, initials: deriveInitials(input.name) },
          });
        }
        for (const groupId of new Set(linked.map((m) => m.groupId))) {
          await logActivity(tx, groupId, ctx.user.id, 'member.updated', { name: input.name });
        }
      });
      return { ok: true as const, membersRenamed: linked.length };
    }),

  /** Store the CZ bank account used for SPAYD QR in all groups (spec §4). */
  setBankAccount: protectedProcedure
    .input(z.object({ account: z.string().trim().max(30) }))
    .mutation(async ({ ctx, input }) => {
      const compact = input.account.replace(/\s+/g, '');
      if (!parseCzAccount(compact)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid account number' });
      }
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { bankAccountEncrypted: ctx.secretBox.encrypt(compact) },
      });
      return { ok: true as const, masked: maskCzAccount(compact) };
    }),

  clearBankAccount: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.user.update({
      where: { id: ctx.user.id },
      data: { bankAccountEncrypted: null },
    });
    return { ok: true as const };
  }),
```

If `logActivity`'s first parameter is typed as `PrismaClient` (not a transaction client), widen its type to `Prisma.TransactionClient | PrismaClient` in `services/activity.ts` — check the file first; only change the type, not behavior.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @evenup/api test -- user-profile` → PASS. Then the full API suite `pnpm --filter @evenup/api test`, `lint`, `typecheck` — PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/user.ts packages/api/src/routers/user-profile.test.ts packages/api/src/services/activity.ts
git commit -m "feat(api): profile procedures — nickname propagation + encrypted CZ bank account"
```

---

### Task 4: API — `generateSpayd` payee resolution order

**Files:**
- Modify: `packages/api/src/routers/settlement.ts`
- Create: `packages/api/src/routers/settlement-resolution.test.ts`

**Interfaces:**
- Consumes: `czAccountToIban` from `@evenup/core` (Task 1); `User.bankAccountEncrypted` (Task 2); `user.setBankAccount` (Task 3, in tests).
- Produces: unchanged `generateSpayd` API shape; new resolution: ① linked user's account (RN = user's name), ② legacy `member.bankDetail`, ③ `PRECONDITION_FAILED` (same message as today).

- [ ] **Step 1: Write the failing tests**

`packages/api/src/routers/settlement-resolution.test.ts`:

```ts
/** generateSpayd payee resolution: user-level account → legacy member IBAN → fail. */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, testPrisma, testSecretBox, resetDb } from '../test/harness.js';

async function setupGroup(creatorEmail: string) {
  const user = await createTestUser(creatorEmail);
  const caller = makeCaller(user);
  const group = await caller.group.create({ name: 'QR', template: 'TRIP', baseCurrency: 'CZK' });
  const creatorMember = await testPrisma.member.findFirstOrThrow({
    where: { groupId: group.id, userId: user.id },
  });
  return { user, caller, group, creatorMember };
}

describe('settlement.generateSpayd resolution', () => {
  beforeEach(resetDb);

  it('uses the linked user account (converted to IBAN, RN = user name)', async () => {
    const { user, caller, group, creatorMember } = await setupGroup('payee@example.com');
    await caller.user.updateProfile({ name: 'Michal Novák' });
    await caller.user.setBankAccount({ account: '19-2000145399/0800' });

    const { spayd } = await caller.settlement.generateSpayd({
      groupId: group.id,
      toMemberId: creatorMember.id,
      amountMinorUnits: 12345,
      currency: 'CZK',
    });
    expect(spayd).toContain('ACC:CZ6508000000192000145399');
    expect(spayd).toContain('RN:');
  });

  it('user-level account beats a legacy member bankDetail', async () => {
    const { caller, group, creatorMember } = await setupGroup('payee2@example.com');
    await testPrisma.bankDetail.create({
      data: {
        memberId: creatorMember.id,
        ibanEncrypted: testSecretBox.encrypt('CZ9455000000001011038930'),
      },
    });
    await caller.user.setBankAccount({ account: '19-2000145399/0800' });

    const { spayd } = await caller.settlement.generateSpayd({
      groupId: group.id,
      toMemberId: creatorMember.id,
      amountMinorUnits: 100,
      currency: 'CZK',
    });
    expect(spayd).toContain('ACC:CZ6508000000192000145399');
  });

  it('falls back to the legacy member bankDetail when the user has no account', async () => {
    const { caller, group, creatorMember } = await setupGroup('payee3@example.com');
    await testPrisma.bankDetail.create({
      data: {
        memberId: creatorMember.id,
        ibanEncrypted: testSecretBox.encrypt('CZ9455000000001011038930'),
      },
    });

    const { spayd } = await caller.settlement.generateSpayd({
      groupId: group.id,
      toMemberId: creatorMember.id,
      amountMinorUnits: 100,
      currency: 'CZK',
    });
    expect(spayd).toContain('ACC:CZ9455000000001011038930');
  });

  it('fails with PRECONDITION_FAILED when neither exists (virtual member)', async () => {
    const { caller, group } = await setupGroup('payee4@example.com');
    const virtual = await caller.member.add({ groupId: group.id, displayName: 'Petr' });

    await expect(
      caller.settlement.generateSpayd({
        groupId: group.id,
        toMemberId: virtual.id,
        amountMinorUnits: 100,
        currency: 'CZK',
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});
```

(`CZ9455000000001011038930` is a checksum-valid CZ IBAN for Raiffeisenbank 5500 — verify with core's `isValidIban` in a quick node eval if in doubt; if it fails validation anywhere, generate any valid IBAN via `czAccountToIban('35-6003800277/0100')`-style helper inside the test instead.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @evenup/api test -- settlement-resolution`
Expected: the "user-level" tests FAIL (today only `bankDetail` is consulted); the legacy + failure tests may already pass.

- [ ] **Step 3: Implement in `settlement.ts`**

Add `czAccountToIban` to the `@evenup/core` import. Change the member lookup include and the IBAN/RN selection (replacing the current `if (!member.bankDetail) throw` + decrypt block):

```ts
      const member = await ctx.prisma.member.findFirst({
        where: { id: input.toMemberId, groupId: input.groupId },
        include: {
          bankDetail: true,
          user: { select: { name: true, bankAccountEncrypted: true } },
        },
      });
      if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });

      // Payee resolution (spec 2026-07-09 §4): the linked user's account-level
      // CZ bank account wins; legacy per-member BankDetail stays as fallback.
      let iban: string | null = null;
      let recipientName = member.displayName;
      let variableSymbol = input.variableSymbol;
      if (member.user?.bankAccountEncrypted) {
        iban = czAccountToIban(ctx.secretBox.decrypt(member.user.bankAccountEncrypted));
        recipientName = member.user.name ?? member.displayName;
      }
      if (!iban && member.bankDetail) {
        iban = ctx.secretBox.decrypt(member.bankDetail.ibanEncrypted);
        recipientName = member.bankDetail.recipientName ?? member.displayName;
        variableSymbol = member.bankDetail.variableSymbol ?? input.variableSymbol;
      }
      if (!iban) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Recipient has no saved IBAN; settle in cash or manually (FR-7.4).',
        });
      }
      const spayd = buildSpayd({
        iban,
        amountMinorUnits: input.amountMinorUnits,
        currency: input.currency,
        message: input.message,
        recipientName,
        variableSymbol,
      });
      return { spayd };
```

Also mark the legacy write path deprecated — in `packages/api/src/routers/member.ts`, extend the doc position above `setBankDetail` with:

```ts
  /** @deprecated Per-member bank details are legacy; the web app now stores the account on the User (spec 2026-07-09). Kept for mobile/back-compat and as a read fallback in generateSpayd. */
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @evenup/api test -- settlement-resolution` → PASS; then full `pnpm --filter @evenup/api test`, `lint`, `typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/settlement.ts packages/api/src/routers/member.ts packages/api/src/routers/settlement-resolution.test.ts
git commit -m "feat(api): resolve QR payee from user-level bank account with legacy fallback"
```

---

### Task 5: Settings UI — Profile card + i18n keys

**Files:**
- Modify: `packages/i18n/src/locales/cs.ts`, `packages/i18n/src/locales/en.ts`
- Modify: `apps/web/src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `user.updateProfile`, `user.setBankAccount`, `user.clearBankAccount`, `me.bankAccountMasked`/`me.name` (Tasks 3); kit components (`Card`, `SectionLabel`, `Input`, `Label`, `Button`, `Check` icon).
- Produces testids the e2e (Task 6) relies on: `profile-name-input`, `profile-name-save`, `profile-name-saved`, `bank-account-input`, `bank-account-save`, `bank-account-masked`, `bank-account-clear`, `bank-account-error`.

- [ ] **Step 1: Add i18n keys**

`packages/i18n/src/locales/cs.ts` (near the `settings.*` block):

```ts
  'profile.title': 'Profil',
  'profile.nickname': 'Přezdívka',
  'profile.nicknameHint': 'Změna se projeví ve všech tvých skupinách.',
  'profile.bankAccount': 'Číslo účtu',
  'profile.bankAccountHint': 'Použije se pro QR platby ve všech tvých skupinách.',
  'profile.bankAccountInvalid': 'Neplatné číslo účtu. Zkontroluj formát 19-2000145399/0800.',
```

`packages/i18n/src/locales/en.ts` (same spot):

```ts
  'profile.title': 'Profile',
  'profile.nickname': 'Nickname',
  'profile.nicknameHint': 'Renaming applies in all your groups.',
  'profile.bankAccount': 'Bank account',
  'profile.bankAccountHint': 'Used for QR payments in all your groups.',
  'profile.bankAccountInvalid': 'Invalid account number. Check the 19-2000145399/0800 format.',
```

- [ ] **Step 2: Add the Profile card to `settings/page.tsx`**

Add state + mutations inside the component (below the existing `apiKey` state):

```tsx
  const [name, setName] = useState('');
  const [account, setAccount] = useState('');
  const [accountError, setAccountError] = useState(false);

  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: () => void utils.user.me.invalidate(),
  });
  const setBankAccount = trpc.user.setBankAccount.useMutation({
    onSuccess: () => {
      setAccount('');
      setAccountError(false);
      void utils.user.me.invalidate();
    },
    onError: () => setAccountError(true),
  });
  const clearBankAccount = trpc.user.clearBankAccount.useMutation({
    onSuccess: () => void utils.user.me.invalidate(),
  });
```

Insert as the FIRST `<Card>` on the page (above the OpenRouter card):

```tsx
      <Card>
        <SectionLabel>{t('profile.title')}</SectionLabel>

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (trimmed) updateProfile.mutate({ name: trimmed });
          }}
        >
          <Label htmlFor="p-name">{t('profile.nickname')}</Label>
          <div className="flex gap-2">
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={me.data?.name ?? ''}
              data-testid="profile-name-input"
            />
            <Button type="submit" disabled={updateProfile.isPending} data-testid="profile-name-save">
              {updateProfile.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('profile.nicknameHint')}</p>
          {updateProfile.isSuccess ? (
            <p
              className="flex items-center gap-1 text-sm text-green-700 dark:text-green-400"
              data-testid="profile-name-saved"
            >
              <Check size={16} aria-hidden /> {t('common.save')}
            </p>
          ) : null}
        </form>

        <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <Label htmlFor="p-account">{t('profile.bankAccount')}</Label>
          {me.data?.bankAccountMasked ? (
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold tabular-nums" data-testid="bank-account-masked">
                {me.data.bankAccountMasked}
              </span>
              <Button
                variant="danger"
                onClick={() => clearBankAccount.mutate()}
                disabled={clearBankAccount.isPending}
                data-testid="bank-account-clear"
              >
                {t('common.delete')}
              </Button>
            </div>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (account.trim()) setBankAccount.mutate({ account: account.trim() });
              }}
            >
              <div className="flex gap-2">
                <Input
                  id="p-account"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="19-2000145399/0800"
                  inputMode="numeric"
                  data-testid="bank-account-input"
                />
                <Button type="submit" disabled={setBankAccount.isPending} data-testid="bank-account-save">
                  {setBankAccount.isPending ? t('common.loading') : t('common.save')}
                </Button>
              </div>
              {accountError ? (
                <p role="alert" className="text-sm text-red-700 dark:text-red-400" data-testid="bank-account-error">
                  {t('profile.bankAccountInvalid')}
                </p>
              ) : null}
            </form>
          )}
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{t('profile.bankAccountHint')}</p>
        </div>
      </Card>
```

Update the page imports: add `SectionLabel` to the `@/components/ui` import. While in the file, restyle the two pre-existing card headings for consistency: `<h3 className="mb-1 font-semibold">OpenRouter API key</h3>` → `<SectionLabel className="mb-1">OpenRouter API key</SectionLabel>` and `<h3 className="mb-3 font-semibold">{t('settings.data.title')}</h3>` → `<SectionLabel>{t('settings.data.title')}</SectionLabel>`.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @evenup/i18n test && pnpm --filter @evenup/web lint && pnpm --filter @evenup/web typecheck
```

Expected: PASS (e2e coverage lands in Task 6).

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/src/locales apps/web/src/app/settings/page.tsx
git commit -m "feat(web): profile card in settings — nickname + bank account for QR"
```

---

### Task 6: Remove the group bank sheet + e2e coverage

**Files:**
- Modify: `apps/web/src/components/group-detail.tsx` (remove `bank` menu item, bank `Sheet`, `BankDetailsForm` + `Landmark` imports)
- Delete: `apps/web/src/components/bank-details-form.tsx`
- Modify: `apps/web/e2e/critical-flow.spec.ts`

**Interfaces:**
- Consumes: settings testids from Task 5; existing e2e helpers `signIn`, `uniqueEmail`, `openGroupSheet`, `closeSheet`.
- Produces: group ⋯ menu has 5 items; SPAYD e2e flows through Settings.

- [ ] **Step 1: Update e2e first (RED)**

In `critical-flow.spec.ts`, in the exact-split/SPAYD test, replace the bank-sheet block:

```ts
    await openGroupSheet(page, 'bank');
    await page.getByTestId('bank-iban-input').fill('CZ6508000000192000145399');
    await page.getByTestId('bank-save-btn').click();
    await closeSheet(page);
```

with the Settings flow (the creator's member is linked to the account, so the account-level number powers the QR; the SPAYD assertion later in the test stays unchanged because `19-2000145399/0800` converts to the same IBAN):

```ts
    // Save the creator's bank account in Settings (CZ format; spec 2026-07-09).
    await page.getByRole('link', { name: /settings|nastavení/i }).click();
    await page.getByTestId('bank-account-input').fill('19-2000145399/0800');
    await page.getByTestId('bank-account-save').click();
    await expect(page.getByTestId('bank-account-masked')).toHaveText('…5399/0800');
    await page.goBack();

    // The per-group bank sheet is gone from the ⋯ menu.
    await page.getByTestId('group-menu-btn').click();
    await expect(page.getByTestId('menu-bank')).toHaveCount(0);
    await page.getByTestId('sheet-close').click();
```

Append a new test inside the describe block:

```ts
  test('nickname change in settings renames linked members in groups', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('nick', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Nick');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Nick').click();
    await expect(page.getByTestId('group-title')).toHaveText('Nick');

    await page.getByRole('link', { name: /settings|nastavení/i }).click();
    await page.getByTestId('profile-name-input').fill('Michal Novák');
    await page.getByTestId('profile-name-save').click();
    await expect(page.getByTestId('profile-name-saved')).toBeVisible();

    await page.goto('/');
    await page.getByText('Nick').click();
    await openGroupSheet(page, 'members');
    await expect(page.getByTestId('member-list').getByText('Michal Novák')).toBeVisible();
  });
```

Run to confirm RED (rebuild + run, chromium only):

```bash
pnpm --filter @evenup/web build   # with the e2e env vars from Global Constraints
pnpm --filter @evenup/web exec playwright test --project=chromium
```

Expected: FAIL — `bank-account-input` exists (Task 5) but `menu-bank` still exists, so the `toHaveCount(0)` assertion fails; the nickname test fails only if Task 5's testids are missing.

- [ ] **Step 2: Remove the bank sheet from `group-detail.tsx`**

- Delete the menu item line `{ key: 'bank', icon: Landmark, label: t('member.iban'), onSelect: () => openPanel('bank') },`
- Delete the `<Sheet open={panel === 'bank'} …><BankDetailsForm …/></Sheet>` block
- Remove `'bank'` from the `Panel` union type
- Remove the `BankDetailsForm` import and drop `Landmark` from the icons import
- Delete the component file:

```bash
rm apps/web/src/components/bank-details-form.tsx
```

(Leave the `member.iban` i18n key — the mobile app may still use it, per spec §6.)

- [ ] **Step 3: Run e2e (GREEN), lint/typecheck**

```bash
pnpm --filter @evenup/web lint && pnpm --filter @evenup/web typecheck
# rebuild + full chromium suite with the e2e env vars:
pnpm --filter @evenup/web build && pnpm --filter @evenup/web exec playwright test --project=chromium
```

Expected: all tests PASS (16 total: 15 existing + the new nickname test).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components apps/web/e2e/critical-flow.spec.ts
git commit -m "feat(web): bank account moves to settings — remove per-group bank sheet"
```

---

### Task 7: Full verification pass

**Files:** only what the checks surface.

- [ ] **Step 1: Whole-workspace pipeline**

```bash
pnpm --filter @evenup/core test && pnpm --filter @evenup/core lint && pnpm --filter @evenup/core typecheck
pnpm --filter @evenup/api test && pnpm --filter @evenup/api lint && pnpm --filter @evenup/api typecheck
pnpm --filter @evenup/i18n test
pnpm --filter @evenup/web lint && pnpm --filter @evenup/web typecheck && pnpm --filter @evenup/web test
# e2e: chromium + webkit (full matrix belongs to CI)
pnpm --filter @evenup/web build && pnpm --filter @evenup/web exec playwright test --project=chromium
pnpm --filter @evenup/web exec playwright test --project=webkit
```

Expected: everything PASS. Fix fallout where it occurs; never weaken assertions or axe tags.

- [ ] **Step 2: Manual sanity (optional, controller may do in browser)**

Settings: set nickname + account, masked display, remove; group: settle sheet shows QR for the linked creator.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "test: account-settings verification fallout"
```

(Skip the commit if the tree is clean.)
