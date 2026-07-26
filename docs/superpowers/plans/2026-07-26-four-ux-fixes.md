# Four UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four independent user-reported fixes — block invite claims from users already in the group, put a message in the SPAYD QR payment, stop showing the English word "Settlement" in the Czech UI, and make the add-expense sheet's amount/title/split controls legible.

**Architecture:** All four are small, local changes to an existing pnpm + Turborepo monorepo. Nothing shares state, so tasks may be implemented and merged in any order. The only schema-adjacent change is a data-only SQL migration (no column changes). Everything user-facing goes through the `@evenup/i18n` catalogs, which enforce cs/en key parity in tests.

**Tech Stack:** TypeScript, Next.js App Router (`apps/web`), tRPC + zod (`packages/api`), Prisma + PostgreSQL (`packages/db`), pure domain logic (`packages/core`), message catalogs (`packages/i18n`), Vitest for unit/integration tests, Playwright for e2e.

**Spec:** [`docs/superpowers/specs/2026-07-26-four-ux-fixes-design.md`](../specs/2026-07-26-four-ux-fixes-design.md)

## Global Constraints

- **Every new message key must be added to BOTH `packages/i18n/src/locales/cs.ts` and `packages/i18n/src/locales/en.ts`.** `packages/i18n/src/i18n.test.ts` asserts every locale defines exactly the same keys as Czech and that no message is empty. A key in only one catalog fails the suite.
- **Czech is the default locale.** `cs.ts` defines the `MessageKey` type; `en.ts` is typed against it.
- **Server error messages are localized by exact English text match.** `packages/api/src/trpc.ts:15-19` builds a reverse map from every `errors.*` value in the **en** catalog to its key. A `TRPCError` message must match its `errors.*` English string **character for character** or it reaches the user untranslated.
- **Money is always integer minor units.** Never introduce floats.
- **Existing `data-testid` attributes are contracts with the Playwright suite.** Do not rename one without updating every spec that uses it (Task 7 does exactly this, deliberately).
- **Test database setup:** API tests need `DATABASE_URL` pointing at a migrated Postgres, and `prisma generate` must have run. Playwright needs `PLAYWRIGHT_BROWSERS_PATH=/home/dev/.cache/ms-playwright` and a prior `next build`; only the chromium project is installed, so always pass `--project=chromium`.
- **Green baseline before any change:** core 262, i18n 31, web 62, api 195, e2e 29 (chromium).

## File Structure

**Task 1 — SPAYD truncation**
- Modify: `packages/core/src/spayd/spayd.ts` (`sanitizeValue`)
- Test: `packages/core/src/spayd/spayd.test.ts`

**Task 2 — QR message**
- Modify: `packages/i18n/src/locales/{cs,en}.ts` (`settle.qrMessage`)
- Modify: `apps/web/src/components/settle-card.tsx` (new `groupName` prop, pass `message`)
- Modify: `apps/web/src/components/group-detail.tsx:296` (pass `groupName`)

**Task 3 — Czech settlement title**
- Modify: `packages/api/src/routers/transaction.ts:230,395` (store `''`)
- Modify: `packages/api/src/routers/member.ts` (localized fallback in the merge-block error)
- Create: `packages/db/prisma/migrations/20260726100000_settlement_title_blank/migration.sql`
- Modify: `packages/i18n/src/locales/{cs,en}.ts` (`transaction.settlement`)
- Modify: `apps/web/src/components/group-detail.tsx:226` (render fallback)
- Modify: `apps/web/src/lib/activity-message.ts` (render fallback)
- Test: `packages/api/src/routers/settlement-title.test.ts` (new)

**Task 4 — Invite guard (API)**
- Modify: `packages/api/src/routers/invite.ts` (`findOwnMembership`, `claimOptions`, `claim`)
- Modify: `packages/i18n/src/locales/{cs,en}.ts` (`errors.alreadyGroupMember`)
- Test: `packages/api/src/routers/invite-guard.test.ts` (new)

**Task 5 — Invite guard (web)**
- Create: `apps/web/src/components/already-member-banner.tsx`
- Modify: `apps/web/src/app/invite/[token]/page.tsx` (redirect)
- Modify: `apps/web/src/app/groups/[id]/page.tsx` (read `searchParams`)
- Modify: `apps/web/src/components/group-detail.tsx` (accept prop, render banner)
- Modify: `packages/i18n/src/locales/{cs,en}.ts` (`invite.alreadyMember`)

**Task 6 — Add-expense amount + title**
- Modify: `apps/web/src/components/add-expense-form.tsx:598-677`
- Modify: `packages/i18n/src/locales/{cs,en}.ts` (`expense.titleLabel`)

**Task 7 — Add-expense split controls**
- Modify: `apps/web/src/components/add-expense-form.tsx` (split type out of the disclosure, per-member fields inline)
- Modify: `packages/i18n/src/locales/{cs,en}.ts` (`expense.splitMethod`)
- Modify: `apps/web/e2e/critical-flow.spec.ts`, `apps/web/e2e/transaction-edit.spec.ts`

---

### Task 1: SPAYD never truncates a percent-escape in half

**Files:**
- Modify: `packages/core/src/spayd/spayd.ts` (function `sanitizeValue`, ~line 48)
- Test: `packages/core/src/spayd/spayd.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: no signature change. `sanitizeValue(value: string, maxLength: number): string` stays private to the module; `buildSpayd(input: SpaydInput): string` is unchanged. Task 2 relies on `MSG:` being capped at 60 characters and always well-formed.

**Background:** `sanitizeValue` percent-escapes reserved and non-ASCII characters, then truncates with `out.slice(0, maxLength)`. That slice can land in the middle of a three-character `%XX` sequence and emit an unparseable descriptor. Czech diacritics are stripped by NFD normalisation before this point, so ordinary Czech never escapes — but `*`, `%`, and emoji do.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/src/spayd/spayd.test.ts`, inside the existing
`describe('buildSpayd (§16.1, FR-7.1)', ...)` block:

```ts
  it('drops a percent-escape that would not fit rather than cutting it in half', () => {
    // 58 plain chars + '*' -> the '*' escapes to '%2A', which would land at 61 of 60.
    const spd = buildSpayd({
      iban: 'CZ5508000000001234567899',
      message: 'a'.repeat(58) + '*',
    });
    const msg = spd.split('*').find((part) => part.startsWith('MSG:'))!.slice(4);
    expect(msg).toBe('a'.repeat(58));
    // A dangling '%' or '%2' would make the whole descriptor unparseable.
    expect(msg).not.toMatch(/%.?$/);
  });

  it('keeps a percent-escape that fits exactly', () => {
    // 57 plain chars + '%2A' == exactly 60.
    const spd = buildSpayd({
      iban: 'CZ5508000000001234567899',
      message: 'a'.repeat(57) + '*',
    });
    const msg = spd.split('*').find((part) => part.startsWith('MSG:'))!.slice(4);
    expect(msg).toBe('a'.repeat(57) + '%2A');
    expect(msg).toHaveLength(60);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @evenup/core exec vitest run src/spayd/spayd.test.ts
```

Expected: the first new test FAILS — the received message ends in `%2`
(59 characters of `a` … actually 58 `a`s plus a truncated `%2`), not a clean
58-character string. The second test passes already.

- [ ] **Step 3: Rewrite `sanitizeValue` to truncate on chunk boundaries**

Replace the whole function in `packages/core/src/spayd/spayd.ts`:

```ts
/** Sanitize a value for inclusion in a SPAYD descriptor (strip diacritics, escape reserved chars). */
function sanitizeValue(value: string, maxLength: number): string {
  const stripped = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let out = '';
  for (const ch of stripped) {
    const code = ch.codePointAt(0)!;
    let chunk: string;
    if (ch === '*' || ch === '%') {
      chunk = '%' + code.toString(16).toUpperCase().padStart(2, '0');
    } else if (code < 0x20) {
      continue; // drop control characters
    } else if (code > 0x7e) {
      chunk = '';
      for (const byte of new TextEncoder().encode(ch)) {
        chunk += '%' + byte.toString(16).toUpperCase().padStart(2, '0');
      }
    } else {
      chunk = ch;
    }
    // Truncate on a chunk boundary. Slicing the finished string could cut a
    // `%XX` escape in half and make the whole descriptor unparseable.
    if (out.length + chunk.length > maxLength) break;
    out += chunk;
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @evenup/core exec vitest run src/spayd/spayd.test.ts
```

Expected: PASS, including the pre-existing `MSG:a%2Ab%25c` and
`MSG:Priste zaplati Zofie` assertions.

- [ ] **Step 5: Run the whole core suite**

```bash
pnpm --filter @evenup/core test
```

Expected: 264 passing (262 baseline + 2 new).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/spayd/spayd.ts packages/core/src/spayd/spayd.test.ts
git commit -m "fix(core): SPAYD truncation no longer splits a percent-escape"
```

---

### Task 2: The QR payment carries a message for the recipient

**Files:**
- Modify: `packages/i18n/src/locales/cs.ts` (after `'settle.qrCode'`, ~line 265)
- Modify: `packages/i18n/src/locales/en.ts` (same position)
- Modify: `apps/web/src/components/settle-card.tsx`
- Modify: `apps/web/src/components/group-detail.tsx:296`

**Interfaces:**
- Consumes: `buildSpayd`'s well-formed 60-character `MSG:` cap from Task 1.
  `settlement.generateSpayd` already accepts `message: z.string().max(60).optional()`
  (`packages/api/src/routers/settlement.ts:21`) — no API change is needed.
- Produces: `SettleCard` gains a required prop.
  `SettleCard(props: { groupId: string; members: MemberLite[]; baseCurrency: string; groupName: string })`.

- [ ] **Step 1: Add the message key to both catalogs**

In `packages/i18n/src/locales/cs.ts`, directly after the `'settle.qrCode'` line:

```ts
  'settle.qrMessage': 'Vyrovnání dluhu {group}',
```

In `packages/i18n/src/locales/en.ts`, at the matching position:

```ts
  'settle.qrMessage': 'Debt settlement {group}',
```

- [ ] **Step 2: Run the i18n suite to confirm parity**

```bash
pnpm --filter @evenup/i18n test
```

Expected: PASS, 31 tests. (The parity test fails loudly if the key landed in
only one catalog — that is the check being run here.)

- [ ] **Step 3: Thread `groupName` through `SettleCard`**

In `apps/web/src/components/settle-card.tsx`, change the `SettleCard` signature
and the `SettleRow` call:

```tsx
export function SettleCard({
  groupId,
  members,
  baseCurrency,
  groupName,
}: {
  groupId: string;
  members: MemberLite[];
  baseCurrency: string;
  groupName: string;
}) {
```

and in the `payments.map(...)` body, add the prop to `<SettleRow …>`:

```tsx
            <SettleRow
              key={`${p.fromMemberId}-${p.toMemberId}-${i}`}
              groupId={groupId}
              baseCurrency={baseCurrency}
              groupName={groupName}
              from={byId.get(p.fromMemberId)}
              to={byId.get(p.toMemberId)}
              amount={p.amountMinorUnits}
            />
```

- [ ] **Step 4: Send the message from `SettleRow`**

Still in `apps/web/src/components/settle-card.tsx`, update `SettleRow`'s
signature and its `generateSpayd` query:

```tsx
function SettleRow({
  groupId,
  baseCurrency,
  groupName,
  from,
  to,
  amount,
}: {
  groupId: string;
  baseCurrency: string;
  groupName: string;
  from?: MemberLite;
  to?: MemberLite;
  amount: number;
}) {
```

```tsx
  const spayd = trpc.settlement.generateSpayd.useQuery(
    {
      groupId,
      toMemberId: to?.id ?? '',
      amountMinorUnits: amount,
      currency: baseCurrency,
      // SPAYD strips diacritics and caps MSG at 60 chars, so this reaches the
      // bank as e.g. "Vyrovnani dluhu Vikend na horach".
      message: t('settle.qrMessage', { group: groupName }),
    },
    { enabled: open && !!to, retry: false },
  );
```

`t` is already destructured from `useI18n()` at the top of `SettleRow` — no new
import.

- [ ] **Step 5: Pass the group name at the call site**

In `apps/web/src/components/group-detail.tsx`, line 296:

```tsx
      <SettleCard
        groupId={groupId}
        members={memberLite}
        baseCurrency={group.data.baseCurrency}
        groupName={group.data.name}
      />
```

- [ ] **Step 6: Typecheck and run the web suite**

```bash
pnpm --filter @evenup/web typecheck && pnpm --filter @evenup/web test
```

Expected: typecheck clean, 62 tests passing. A missing `groupName` at any
`SettleCard` call site surfaces here as a type error.

- [ ] **Step 7: Commit**

```bash
git add packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts \
        apps/web/src/components/settle-card.tsx \
        apps/web/src/components/group-detail.tsx
git commit -m "feat(web): QR payment carries a message naming the group"
```

---

### Task 3: A settlement's title is localized, not stored in English

**Files:**
- Modify: `packages/api/src/routers/transaction.ts:230` and `:395`
- Modify: `packages/api/src/routers/member.ts` (imports + line ~207)
- Create: `packages/db/prisma/migrations/20260726100000_settlement_title_blank/migration.sql`
- Modify: `packages/i18n/src/locales/{cs,en}.ts`
- Modify: `apps/web/src/components/group-detail.tsx:226`
- Modify: `apps/web/src/lib/activity-message.ts`
- Test: `packages/api/src/routers/settlement-title.test.ts` (new)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Transaction.title` is `''` for settlements recorded without a note.
  Any consumer rendering a transaction title must fall back to the
  `transaction.settlement` message. `Transaction.title` stays `String`
  (non-nullable) — no schema change.

**Background:** `recordTransfer` and `updateTransfer` write the literal English
`'Settlement'` into the database, and `group-detail.tsx:226` renders it raw. The
string is persisted, so a code-only fix leaves every existing settlement reading
"Settlement".

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/routers/settlement-title.test.ts`:

```ts
/** A settlement stores no title of its own; the label is localized at render time. */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, testPrisma, resetDb } from '../test/harness.js';

async function setupGroupWithTwoMembers() {
  const user = await createTestUser('titles@example.com');
  const caller = makeCaller(user);
  const group = await caller.group.create({
    name: 'Tituly',
    template: 'TRIP',
    baseCurrency: 'CZK',
  });
  const payer = await testPrisma.member.findFirstOrThrow({
    where: { groupId: group.id, userId: user.id },
  });
  const payee = await caller.member.add({ groupId: group.id, displayName: 'Petr' });
  return { caller, group, payer, payee };
}

describe('settlement titles', () => {
  beforeEach(resetDb);

  it('stores an empty title when no note is given', async () => {
    const { caller, group, payer, payee } = await setupGroupWithTwoMembers();
    const tx = await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: payer.id,
      toMemberId: payee.id,
      amountMinorUnits: 10_000,
      currency: 'CZK',
      method: 'CASH',
    });
    const stored = await testPrisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(stored.title).toBe('');
  });

  it('keeps a note the user actually typed', async () => {
    const { caller, group, payer, payee } = await setupGroupWithTwoMembers();
    const tx = await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: payer.id,
      toMemberId: payee.id,
      amountMinorUnits: 10_000,
      currency: 'CZK',
      method: 'CASH',
      note: 'Za benzín',
    });
    const stored = await testPrisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(stored.title).toBe('Za benzín');
  });

  it('never writes the English word Settlement', async () => {
    const { caller, group, payer, payee } = await setupGroupWithTwoMembers();
    await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: payer.id,
      toMemberId: payee.id,
      amountMinorUnits: 500,
      currency: 'CZK',
      method: 'QR',
    });
    const leaked = await testPrisma.transaction.count({ where: { title: 'Settlement' } });
    expect(leaked).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @evenup/api exec vitest run src/routers/settlement-title.test.ts
```

Expected: the first and third tests FAIL — `stored.title` is `'Settlement'`.
The second passes already.

- [ ] **Step 3: Stop storing the English literal**

In `packages/api/src/routers/transaction.ts`, at **line 230** (inside
`recordTransfer`) and **line 395** (inside `updateTransfer`), change both
occurrences of:

```ts
        title: input.note ?? 'Settlement',
```

to:

```ts
        // No note means no title of its own — the UI localizes it via
        // `transaction.settlement`. Storing English here leaked into the Czech UI.
        title: input.note ?? '',
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @evenup/api exec vitest run src/routers/settlement-title.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Add the message key to both catalogs**

In `packages/i18n/src/locales/cs.ts`, next to the other transaction-related keys:

```ts
  'transaction.settlement': 'Vyrovnání',
```

In `packages/i18n/src/locales/en.ts`:

```ts
  'transaction.settlement': 'Settlement',
```

Do **not** reuse `balance.breakdown.settlement` (`vyrovnání`, lower-case) — it is
mid-sentence prose, not a title.

- [ ] **Step 6: Fall back to the localized label in the transaction list**

In `apps/web/src/components/group-detail.tsx`, line 226:

```tsx
                        <p className="truncate text-sm font-semibold">
                          {tx.title || t('transaction.settlement')}
                        </p>
```

- [ ] **Step 7: Fall back in the activity feed**

In `apps/web/src/lib/activity-message.ts`, change the two cases that read a
stored title (currently lines 35 and 37):

```ts
    case 'transaction.updated':
      return t('activity.edited', {
        actor,
        item: str(p.title) || t('transaction.settlement'),
      });
    case 'transaction.deleted':
      return t('activity.deleted', {
        actor,
        item: str(p.title) || t('transaction.settlement'),
      });
```

- [ ] **Step 8: Fall back in the merge-blocked error**

In `packages/api/src/routers/member.ts`, add the i18n import next to the other
package imports at the top of the file:

```ts
import { t as translate } from '@evenup/i18n';
```

Then, at the `selfTransfers` guard (~line 203), use the localized label for an
empty title:

```ts
      if (selfTransfers.length > 0) {
        const label = translate(ctx.locale, 'transaction.settlement');
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Resolve the transfer(s) between these members first: ${selfTransfers
            .map((tr) => `${tr.title || label} (${tr.date.toISOString().slice(0, 10)})`)
            .join(', ')}`,
        });
      }
```

This message is built dynamically, so it cannot go through the `errors.*`
reverse map in `trpc.ts` — `ctx.locale` is the right tool here.

- [ ] **Step 9: Write the data migration**

Create `packages/db/prisma/migrations/20260726100000_settlement_title_blank/migration.sql`:

```sql
-- Settlements used to persist the English literal 'Settlement' as their title,
-- which leaked untranslated into the Czech UI. An empty title now means "no
-- note of its own" and the label is resolved at render time.
-- Scoped to TRANSFER so an expense a user genuinely named "Settlement" survives.
UPDATE "Transaction" SET title = '' WHERE type = 'TRANSFER' AND title = 'Settlement';
```

- [ ] **Step 10: Apply the migration and verify it is idempotent**

```bash
pnpm --filter @evenup/db exec prisma migrate deploy
pnpm --filter @evenup/db exec prisma migrate status
```

Expected: `migrate deploy` reports the new migration applied; `migrate status`
reports the schema up to date with no drift. Re-running `deploy` is a no-op.

- [ ] **Step 11: Run the api, i18n and web suites**

```bash
pnpm --filter @evenup/i18n test && pnpm --filter @evenup/api test && pnpm --filter @evenup/web test
```

Expected: i18n 31, api 198 (195 baseline + 3 new), web 62.

- [ ] **Step 12: Commit**

```bash
git add packages/api/src/routers/transaction.ts \
        packages/api/src/routers/member.ts \
        packages/api/src/routers/settlement-title.test.ts \
        packages/db/prisma/migrations/20260726100000_settlement_title_blank/migration.sql \
        packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts \
        apps/web/src/components/group-detail.tsx \
        apps/web/src/lib/activity-message.ts
git commit -m "fix: localize the settlement label instead of storing English in the DB"
```

---

### Task 4: The API refuses an invite claim from an existing member

**Files:**
- Modify: `packages/api/src/routers/invite.ts`
- Modify: `packages/i18n/src/locales/{cs,en}.ts` (`errors.alreadyGroupMember`)
- Test: `packages/api/src/routers/invite-guard.test.ts` (new)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, for Task 5:
  - `invite.claimOptions` returns `{ groupId: string; alreadyMember: boolean; groupName: string; baseCurrency: string; members: Array<{ id: string; displayName: string; initials: string; color: string; balanceMinorUnits: number }> }`. When `alreadyMember` is `true`, `members` is `[]`.
  - `invite.claim` throws `TRPCError { code: 'CONFLICT' }` for a user who already holds a *different* active member in the group, and is an idempotent no-op when re-claiming the member they already hold.

**Background:** `claim` only checks that the *target* member is unheld. A user
already in the group can therefore take over someone else's identity, or create
a duplicate member for themselves — the exact failure the duplicate-member work
set out to prevent, through a path it did not close.

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/routers/invite-guard.test.ts`:

```ts
/** An invite cannot be claimed by someone who is already in the group. */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, testPrisma, resetDb } from '../test/harness.js';

/** A group owned by `owner@example.com`, one unclaimed member, one open invite. */
async function setupInvite() {
  const owner = await createTestUser('owner@example.com');
  const ownerCaller = makeCaller(owner);
  const group = await ownerCaller.group.create({
    name: 'Chata',
    template: 'TRIP',
    baseCurrency: 'CZK',
  });
  const ownerMember = await testPrisma.member.findFirstOrThrow({
    where: { groupId: group.id, userId: owner.id },
  });
  const placeholder = await ownerCaller.member.add({
    groupId: group.id,
    displayName: 'Marek',
  });
  const invite = await ownerCaller.invite.create({ groupId: group.id });
  return { owner, ownerCaller, group, ownerMember, placeholder, invite };
}

describe('invite.claim guards against an existing membership', () => {
  beforeEach(resetDb);

  it('refuses to let an existing member claim a different member', async () => {
    const { ownerCaller, placeholder, invite } = await setupInvite();
    // The owner is already in the group; "Marek" is someone else's placeholder.
    await expect(
      ownerCaller.invite.claim({ token: invite.token, memberId: placeholder.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses to let an existing member join as a brand-new member', async () => {
    const { ownerCaller, group, invite } = await setupInvite();
    await expect(ownerCaller.invite.claim({ token: invite.token })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    const memberCount = await testPrisma.member.count({ where: { groupId: group.id } });
    expect(memberCount).toBe(2); // owner + placeholder, no duplicate
  });

  it('re-claiming the member you already hold is an idempotent no-op', async () => {
    const { ownerCaller, group, ownerMember, invite } = await setupInvite();
    const result = await ownerCaller.invite.claim({
      token: invite.token,
      memberId: ownerMember.id,
    });
    expect(result.id).toBe(ownerMember.id);

    // No second join: the usage counter and the activity log are untouched.
    const stored = await testPrisma.invite.findUniqueOrThrow({ where: { token: invite.token } });
    expect(stored.usedCount).toBe(0);
    const joins = await testPrisma.activityLog.count({
      where: { groupId: group.id, action: 'member.joined' },
    });
    expect(joins).toBe(0);
  });

  it('lets a removed member rejoin through a fresh link', async () => {
    const { invite, placeholder } = await setupInvite();
    const newcomer = await createTestUser('newcomer@example.com');
    const newcomerCaller = makeCaller(newcomer);
    await newcomerCaller.invite.claim({ token: invite.token, memberId: placeholder.id });

    // Removal deactivates rather than deletes (FR-2.4), so the guard must look
    // at active members only — otherwise a removed person could never come back.
    await testPrisma.member.update({
      where: { id: placeholder.id },
      data: { isActive: false },
    });

    const rejoined = await newcomerCaller.invite.claim({ token: invite.token });
    expect(rejoined.isActive).toBe(true);
    expect(rejoined.id).not.toBe(placeholder.id);
  });

  it('claimOptions reports an existing membership and hides the name list', async () => {
    const { ownerCaller, group, invite } = await setupInvite();
    const options = await ownerCaller.invite.claimOptions({ token: invite.token });
    expect(options.alreadyMember).toBe(true);
    expect(options.groupId).toBe(group.id);
    expect(options.members).toEqual([]);
  });

  it('claimOptions still lists names for a genuine newcomer', async () => {
    const { invite, placeholder } = await setupInvite();
    const newcomer = await createTestUser('fresh@example.com');
    const options = await makeCaller(newcomer).invite.claimOptions({ token: invite.token });
    expect(options.alreadyMember).toBe(false);
    expect(options.members.map((m) => m.id)).toContain(placeholder.id);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @evenup/api exec vitest run src/routers/invite-guard.test.ts
```

Expected: the first, second, third and fifth tests FAIL. The first two fail
because no guard exists (the claim succeeds). The third fails because
`usedCount` is incremented to 1. The fifth fails because `alreadyMember` and
`groupId` are not in the response. The fourth and sixth pass already.

- [ ] **Step 3: Add the error message to both catalogs**

In `packages/i18n/src/locales/en.ts`, next to the other `errors.invite*` keys:

```ts
  'errors.alreadyGroupMember': 'You are already a member of this group',
```

In `packages/i18n/src/locales/cs.ts`, at the matching position:

```ts
  'errors.alreadyGroupMember': 'V této skupině už člena máš',
```

The English value must match the thrown message **exactly** — `trpc.ts:15-19`
maps error text back to its key by string equality.

- [ ] **Step 4: Add the shared membership lookup**

In `packages/api/src/routers/invite.ts`, add the type import next to the
existing imports:

```ts
import type { PrismaClient, Prisma } from '@evenup/db';
```

and define the helper above `export const inviteRouter`:

```ts
/**
 * The viewer's own active member in this group, if any.
 *
 * `isActive: true` is deliberate: `member.remove` deactivates rather than
 * deletes (FR-2.4), so someone removed from the group may legitimately rejoin
 * through a fresh link.
 */
function findOwnMembership(
  db: PrismaClient | Prisma.TransactionClient,
  groupId: string,
  userId: string,
) {
  return db.member.findFirst({ where: { groupId, userId, isActive: true } });
}
```

- [ ] **Step 5: Report the existing membership from `claimOptions`**

In `packages/api/src/routers/invite.ts`, replace the body of `claimOptions`
after the expiry check with:

```ts
      const own = await findOwnMembership(ctx.prisma, invite.groupId, ctx.user.id);
      if (own) {
        // Nothing to pick — the page redirects into the group. Skip the balance
        // query entirely rather than computing a list nobody will see.
        return {
          groupId: invite.groupId,
          alreadyMember: true,
          groupName: invite.group.name,
          baseCurrency: invite.group.baseCurrency,
          members: [] as {
            id: string;
            displayName: string;
            initials: string;
            color: string;
            balanceMinorUnits: number;
          }[],
        };
      }

      const { balances } = await getGroupBalances(ctx.prisma, invite.groupId, invite.group);
      const balanceById = new Map(balances.map((b) => [b.memberId, b.balanceMinorUnits]));

      return {
        groupId: invite.groupId,
        alreadyMember: false,
        groupName: invite.group.name,
        baseCurrency: invite.group.baseCurrency,
        members: invite.group.members
          .filter((m) => m.userId === null && m.isActive)
          .map((m) => ({
            id: m.id,
            displayName: m.displayName,
            initials: m.initials,
            color: m.color,
            balanceMinorUnits: balanceById.get(m.id) ?? 0,
          })),
      };
```

The explicit array type on the empty `members` keeps both branches structurally
identical, so tRPC infers one clean shape instead of a union.

- [ ] **Step 6: Guard `claim` and make the self-claim idempotent**

In `packages/api/src/routers/invite.ts`, replace the `$transaction` block and the
activity logging that follows it:

```ts
      const { member, joined } = await ctx.prisma.$transaction(async (tx) => {
        const own = await findOwnMembership(tx, invite.groupId, ctx.user.id);
        if (own) {
          // Re-claiming the member you already hold is a retried request, not a
          // second join: no usage bump, no duplicate activity entry.
          if (input.memberId === own.id) return { member: own, joined: false };
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'You are already a member of this group',
          });
        }

        let claimed;
        if (input.memberId) {
          const target = await tx.member.findFirst({
            where: { id: input.memberId, groupId: invite.groupId },
          });
          if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
          if (target.userId && target.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'CONFLICT', message: 'Member already claimed' });
          }
          claimed = await tx.member.update({
            where: { id: target.id },
            data: { userId: ctx.user.id },
          });
        } else {
          const count = await tx.member.count({ where: { groupId: invite.groupId } });
          // Prefer the name entered at sign-up; fall back to the email local-part.
          const derivedName = ctx.user.name?.trim() || ctx.user.email.split('@')[0] || 'Guest';
          const name = input.displayName ?? derivedName;
          claimed = await tx.member.create({
            data: {
              groupId: invite.groupId,
              displayName: name,
              initials: deriveInitials(name),
              color: colorForIndex(count),
              userId: ctx.user.id,
            },
          });
        }
        await tx.invite.update({
          where: { id: invite.id },
          data: { usedCount: { increment: 1 } },
        });
        return { member: claimed, joined: true };
      });

      // Claiming an invite is the only way a Member ever gains a userId, and it
      // left no trace in the activity log (FR-9.1). The group's other members
      // learn about it in their next digest.
      if (joined) {
        await logActivity(ctx.prisma, invite.groupId, ctx.user.id, 'member.joined', {
          name: member.displayName,
        });
      }
      return member;
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
pnpm --filter @evenup/api exec vitest run src/routers/invite-guard.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 8: Run the full api and i18n suites**

```bash
pnpm --filter @evenup/i18n test && pnpm --filter @evenup/api test
```

Expected: i18n 31, api 204 (198 after Task 3 + 6 new). If Task 3 has not been
done yet, expect 201.

- [ ] **Step 9: Commit**

```bash
git add packages/api/src/routers/invite.ts \
        packages/api/src/routers/invite-guard.test.ts \
        packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts
git commit -m "fix(api): refuse an invite claim from someone already in the group"
```

---

### Task 5: The invite link takes an existing member straight into the group

**Files:**
- Create: `apps/web/src/components/already-member-banner.tsx`
- Modify: `apps/web/src/app/invite/[token]/page.tsx`
- Modify: `apps/web/src/app/groups/[id]/page.tsx`
- Modify: `apps/web/src/components/group-detail.tsx`
- Modify: `packages/i18n/src/locales/{cs,en}.ts`

**Interfaces:**
- Consumes: `invite.claimOptions` returning `{ groupId, alreadyMember, … }` from
  Task 4.
- Produces:
  - `AlreadyMemberBanner(props: { groupId: string; show: boolean }): JSX.Element | null`
  - `GroupDetail(props: { groupId: string; alreadyMemberNotice?: boolean })`

The server guard from Task 4 stays the real protection; this task is UX only and
must not be treated as a replacement for it.

- [ ] **Step 1: Add the banner message to both catalogs**

In `packages/i18n/src/locales/cs.ts`, next to the other `invite.*` keys:

```ts
  'invite.alreadyMember': 'V téhle skupině už jsi jako {name}. Pozvánku nepotřebuješ.',
```

In `packages/i18n/src/locales/en.ts`:

```ts
  'invite.alreadyMember': "You're already in this group as {name}. You don't need an invite.",
```

- [ ] **Step 2: Run the i18n suite**

```bash
pnpm --filter @evenup/i18n test
```

Expected: PASS, 31 tests.

- [ ] **Step 3: Create the banner component**

Create `apps/web/src/components/already-member-banner.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { Card, iconButtonClass } from '@/components/ui';
import { X } from '@/components/icons';

/**
 * Shown once, after an invite link redirected someone who is already in the
 * group. Purely informational — no confirm button, because the point of the
 * redirect was to remove a click, not relocate it.
 */
export function AlreadyMemberBanner({ groupId, show }: { groupId: string; show: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { data: session } = useSession();
  const group = trpc.group.get.useQuery({ groupId }, { enabled: show });
  const [dismissed, setDismissed] = useState(false);

  if (!show || dismissed) return null;
  const me = group.data?.members.find((m) => m.isActive && m.userId === session?.user?.id);
  // The membership changed between the redirect and this render — say nothing
  // rather than render a sentence with a hole where the name should be.
  if (!me) return null;

  return (
    <Card className="flex items-start gap-3 border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950">
      <p className="min-w-0 flex-1 text-sm" data-testid="already-member-banner">
        {t('invite.alreadyMember', { name: me.displayName })}
      </p>
      <button
        type="button"
        aria-label={t('common.cancel')}
        data-testid="already-member-dismiss"
        className={iconButtonClass}
        onClick={() => {
          // Hide immediately, then drop the query param so a reload stays quiet.
          setDismissed(true);
          router.replace(`/groups/${groupId}`, { scroll: false });
        }}
      >
        <X size={16} aria-hidden />
      </button>
    </Card>
  );
}
```

- [ ] **Step 4: Redirect from the invite page**

In `apps/web/src/app/invite/[token]/page.tsx`, add `useEffect` to the React
import:

```tsx
import { use, useEffect, useRef, useState } from 'react';
```

Then, immediately after the `claim` mutation declaration and **before** the
early `return`s, add the redirect effect:

```tsx
  // Already in this group? Don't make them read a card and click a button —
  // go straight there and explain it with a banner on arrival. The server-side
  // guard in `invite.claim` is what actually prevents a duplicate; this is UX.
  const alreadyMember = options.data?.alreadyMember ?? false;
  const alreadyGroupId = options.data?.groupId;
  useEffect(() => {
    if (alreadyMember && alreadyGroupId) {
      router.replace(`/groups/${alreadyGroupId}?already=1`);
    }
  }, [alreadyMember, alreadyGroupId, router]);
```

Then guard the render so the name list never flashes. Add this directly after
the existing `if (options.isError || !options.data) { … }` block:

```tsx
  if (options.data.alreadyMember) {
    return <p className="text-zinc-500 dark:text-zinc-400">{t('common.loading')}</p>;
  }
```

Hooks must run unconditionally, which is why the effect is declared above the
early returns and the guard below them.

- [ ] **Step 5: Read the query param in the group page**

Replace the whole of `apps/web/src/app/groups/[id]/page.tsx`:

```tsx
import { GroupDetail } from '@/components/group-detail';

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ already?: string }>;
}) {
  const { id } = await params;
  const { already } = await searchParams;
  // Read here rather than with `useSearchParams()` in the client component,
  // which would need a Suspense boundary around the whole group detail.
  return <GroupDetail groupId={id} alreadyMemberNotice={already === '1'} />;
}
```

- [ ] **Step 6: Render the banner in the group detail**

In `apps/web/src/components/group-detail.tsx`, add the import next to the
existing `DuplicateBanner` import:

```tsx
import { AlreadyMemberBanner } from '@/components/already-member-banner';
```

Change the component signature:

```tsx
export function GroupDetail({
  groupId,
  alreadyMemberNotice = false,
}: {
  groupId: string;
  alreadyMemberNotice?: boolean;
}) {
```

and render the banner directly above `<DuplicateBanner …>` (line ~191):

```tsx
      <AlreadyMemberBanner groupId={groupId} show={alreadyMemberNotice} />

      <DuplicateBanner groupId={groupId} />
```

- [ ] **Step 7: Typecheck and run the web suite**

```bash
pnpm --filter @evenup/web typecheck && pnpm --filter @evenup/web test
```

Expected: typecheck clean, 62 tests passing.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/already-member-banner.tsx \
        apps/web/src/app/invite/\[token\]/page.tsx \
        apps/web/src/app/groups/\[id\]/page.tsx \
        apps/web/src/components/group-detail.tsx \
        packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts
git commit -m "feat(web): send an existing member straight into the group from an invite link"
```

---

### Task 6: Add-expense — the amount and title read as labelled fields

**Files:**
- Modify: `apps/web/src/components/add-expense-form.tsx:598-677`
- Modify: `packages/i18n/src/locales/{cs,en}.ts` (`expense.titleLabel`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no API change. The `expense-amount-input`, `expense-currency-select`
  and `expense-title-input` test ids are **preserved** — the e2e suite depends on
  all three and this task must not break it.

**Background:** neither field has a label (only placeholders, which vanish on
first keystroke); the number sits in a fixed `w-40` box with the currency
`position: absolute` at the far right, so they don't read as one value and a long
amount collides with the select; and the title looks like a caption of the number.

- [ ] **Step 1: Add the title label to both catalogs**

In `packages/i18n/src/locales/cs.ts`, next to the other `expense.*` keys:

```ts
  'expense.titleLabel': 'Za co?',
```

In `packages/i18n/src/locales/en.ts`:

```ts
  'expense.titleLabel': 'What for?',
```

Leave `expense.title` (`Název`) alone — line 442 of the form uses it as a
*default value* for an unnamed itemized expense, so it cannot double as the label.

- [ ] **Step 2: Run the i18n suite**

```bash
pnpm --filter @evenup/i18n test
```

Expected: PASS, 31 tests.

- [ ] **Step 3: Rebuild the amount block**

In `apps/web/src/components/add-expense-form.tsx`, replace the amount block
(currently lines 598-637, the comment through the closing `</div>` after the
currency `<select>`):

```tsx
          {/* Amount — labelled, and the currency shares the number's optical
              centre. `items-center` (not `items-baseline`) matters: against 40px
              digits a baseline-aligned control sits ~14px low and reads as a
              second line. No absolute positioning and no fixed width, so a long
              amount has nothing to collide with. */}
          <div>
            <SectionLabel className="text-center">{t('expense.amount')}</SectionLabel>
            <div className="flex items-center justify-center gap-2.5">
              <input
                id="e-amount"
                inputMode="decimal"
                autoFocus={splitType !== 'ITEMIZED'}
                value={displayAmount}
                onChange={(e) => {
                  if (splitType !== 'ITEMIZED')
                    setAmount(clampAmountDecimals(e.target.value, currency));
                }}
                readOnly={splitType === 'ITEMIZED'}
                placeholder="0"
                required
                aria-label={t('expense.amount')}
                data-testid="expense-amount-input"
                className={`max-w-full bg-transparent text-center text-4xl font-extrabold tabular-nums text-zinc-900 outline-none placeholder:text-zinc-300 dark:text-zinc-100 dark:placeholder:text-zinc-600 ${
                  splitType === 'ITEMIZED' ? 'cursor-default' : ''
                }`}
                // Grows with its content instead of the old fixed w-40. `ch` is
                // the width of "0", and `tabular-nums` makes every digit that
                // wide, so this tracks the real rendered width.
                style={{ width: `${Math.max(displayAmount.length, 1)}ch` }}
              />
              <select
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  setFxRate('');
                }}
                aria-label={t('expense.currency')}
                data-testid="expense-currency-select"
                className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm font-medium outline-none focus:border-brand-500 dark:border-zinc-700 dark:bg-zinc-800"
              >
                {[baseCurrency, ...COMMON_CURRENCIES]
                  .filter((c, i, arr) => arr.indexOf(c) === i)
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
            </div>
          </div>
```

- [ ] **Step 4: Turn the title into a labelled field**

Replace the title input (currently lines 667-677):

```tsx
          {/* Title — a real labelled field, not a caption under the number. */}
          <div>
            <Label htmlFor="e-title">
              {t('expense.titleLabel')} <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="e-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder={t('expense.title')}
              data-testid="expense-title-input"
            />
          </div>
```

`Label` and `Input` are already imported at the top of the file. The visible
`<Label>` replaces the old `aria-label`, so screen readers still get a name.
`SectionLabel` (`ui.tsx:118`) already merges a `className` prop, so the
`text-center` in Step 3 needs no change to that component.

- [ ] **Step 5: Typecheck and run the web suite**

```bash
pnpm --filter @evenup/web typecheck && pnpm --filter @evenup/web test
```

Expected: typecheck clean, 62 tests passing.

- [ ] **Step 6: Run the e2e suite to confirm the test ids still resolve**

```bash
pnpm --filter @evenup/web build
PLAYWRIGHT_BROWSERS_PATH=/home/dev/.cache/ms-playwright \
  pnpm --filter @evenup/web exec playwright test --project=chromium
```

Expected: 29 passing. This task changes markup around three test ids the suite
uses heavily; if any spec fails here it is a real regression, not an expected
update (Task 7 owns the intentional spec changes).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/add-expense-form.tsx \
        packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts
git commit -m "feat(web): label the add-expense amount and title, pin currency to the amount"
```

---

### Task 7: Add-expense — the split controls sit with what they govern

**Files:**
- Modify: `apps/web/src/components/add-expense-form.tsx`
- Modify: `packages/i18n/src/locales/{cs,en}.ts` (`expense.splitMethod`)
- Modify: `apps/web/e2e/critical-flow.spec.ts` (~118, ~275, ~483-500)
- Modify: `apps/web/e2e/transaction-edit.spec.ts` (~65, ~87, ~99)

**Interfaces:**
- Consumes: the amount/title layout from Task 6 (this task edits the same file
  below it; do Task 6 first to avoid a conflict).
- Produces:
  - **Retired test id:** `expense-split-row` no longer exists.
  - **Preserved test ids:** `split-type-{EQUAL|EXACT|SHARES|PERCENTAGE|ITEMIZED}`,
    `per-member-inputs`, `member-value-{id}`, `split-select-all`.
  - `split-type-*` controls are now always rendered, so a spec can click one
    without opening a disclosure first.

**Background:** `t('expense.splitBetween')` ("Rozdělit mezi") currently labels two
different things — the member picker's heading and the disclosure row whose value
is the split *type*. Both the type selector and the per-member amount fields are
collapsed *below* the members they govern.

- [ ] **Step 1: Add the split-method label to both catalogs**

In `packages/i18n/src/locales/cs.ts`:

```ts
  'expense.splitMethod': 'Jak rozdělit',
```

In `packages/i18n/src/locales/en.ts`:

```ts
  'expense.splitMethod': 'How to split',
```

- [ ] **Step 2: Run the i18n suite**

```bash
pnpm --filter @evenup/i18n test
```

Expected: PASS, 31 tests.

- [ ] **Step 3: Hoist the split-type selector above the member picker**

In `apps/web/src/components/add-expense-form.tsx`, insert this block
**immediately before** the `{/* For whom … */}` member-picker block (currently
starting at line 717):

```tsx
          {/* How to split — always visible, and above the members it governs. */}
          <div>
            <SectionLabel>{t('expense.splitMethod')}</SectionLabel>
            <Segmented
              ariaLabel={t('expense.splitMethod')}
              value={splitType}
              onChange={(v) => setSplitType(v as SplitType)}
              testIdPrefix="split-type"
              options={(Object.keys(SPLIT_LABELS) as SplitType[]).map((st) => ({
                value: st,
                label: t(SPLIT_LABELS[st]),
              }))}
            />
          </div>

          {splitType === 'ITEMIZED' ? (
            <ItemizedEditor
              items={itemRows}
              onChange={setItemRows}
              members={members}
              baseCurrency={currency}
            />
          ) : null}
```

- [ ] **Step 4: Move the per-member fields next to the member chips**

Still in `apps/web/src/components/add-expense-form.tsx`, in the member-picker
block. That block is an outer `<div>` containing a heading row and then a
`<div role="group" aria-label={t('expense.splitBetween')}>` holding the chips.

Insert the following **after that inner `role="group"` div closes, but before the
outer `<div>` closes** — so the per-member fields sit directly under the chips
they belong to:

```tsx
              {splitType !== 'EQUAL' ? (
                <div className="mt-3 space-y-2" data-testid="per-member-inputs">
                  {selectedMembers.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <MemberChip
                        initials={m.initials}
                        color={m.color}
                        name={m.displayName}
                        imageUrl={m.imageUrl}
                        size="sm"
                      />
                      <span className="flex-1 text-sm">{m.displayName}</span>
                      <div className="w-28">
                        <Input
                          inputMode="decimal"
                          aria-label={`${m.displayName} ${perMemberLabel}`}
                          placeholder={perMemberLabel}
                          value={memberFieldValue(m.id)}
                          onChange={(e) =>
                            setValues((v) => ({
                              ...v,
                              [m.id]:
                                splitType === 'EXACT'
                                  ? clampAmountDecimals(e.target.value, currency)
                                  : e.target.value,
                            }))
                          }
                          data-testid={`member-value-${m.id}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
```

This sits inside the `splitType !== 'ITEMIZED'` conditional that already wraps the
member picker, so ITEMIZED is unaffected.

- [ ] **Step 5: Delete the split disclosure row**

Remove the entire first `<DisclosureRow …>` element (currently lines 778-838 —
the one with `testId="expense-split-row"`, its `Segmented`, its `ItemizedEditor`
branch and its `per-member-inputs` branch). Both of its children now live above,
in Steps 3 and 4.

The Category, Date, Repeat and Receipt rows stay exactly as they are.

- [ ] **Step 6: Remove the now-unused `splitOpen` binding and narrow `Row`**

Delete line 515:

```tsx
  const splitOpen = openRow === 'split';
```

Then narrow the `Row` type at line 100, since nothing can set `'split'` any more:

```tsx
type Row = 'category' | 'date' | 'repeat' | null;
```

Leave `openRow` / `toggleRow` alone — the remaining three disclosure rows still
use both.

- [ ] **Step 7: Typecheck, lint and run the web suite**

```bash
pnpm --filter @evenup/web typecheck && pnpm --filter @evenup/web lint && pnpm --filter @evenup/web test
```

Expected: all clean, 62 tests passing. An unused-variable error here means
Step 6 was missed.

- [ ] **Step 8: Update the e2e specs**

In `apps/web/e2e/critical-flow.spec.ts`, delete every
`await page.getByTestId('expense-split-row').click();` line (~118, ~275, ~483) —
the controls are visible without opening anything.

At ~488, delete the stale assertion and its comment:

```ts
    // The split row is collapsible now (users asked to be able to close it), so
    // its toggle stays enabled even for a non-EQUAL split.
    await expect(page.getByTestId('expense-split-row')).toBeEnabled();
```

At ~500, replace the collapsed-state assertion — the selector is always mounted
now, so absence is the wrong check; assert the split type reset to EQUAL instead:

```ts
    await expect(page.getByTestId('split-type-EQUAL')).toHaveAttribute('aria-checked', 'true');
```

Update the comment above it, which no longer describes reality:

```ts
    // Reopening starts from clean defaults — the split type is back to EQUAL and
    // the currency is back to base.
```

In `apps/web/e2e/transaction-edit.spec.ts`, delete the three
`await page.getByTestId('expense-split-row').click();` lines (~65, ~87, ~99).

- [ ] **Step 9: Confirm no reference to the retired test id survives**

```bash
grep -rn "expense-split-row" apps/web packages || echo "clean"
```

Expected: `clean`.

- [ ] **Step 10: Run the e2e suite**

```bash
pnpm --filter @evenup/web build
PLAYWRIGHT_BROWSERS_PATH=/home/dev/.cache/ms-playwright \
  pnpm --filter @evenup/web exec playwright test --project=chromium
```

Expected: 29 passing.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/components/add-expense-form.tsx \
        apps/web/e2e/critical-flow.spec.ts \
        apps/web/e2e/transaction-edit.spec.ts \
        packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts
git commit -m "feat(web): split controls sit with the members they govern"
```

---

### Final verification

- [ ] **Run every suite from a clean state**

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @evenup/web build
PLAYWRIGHT_BROWSERS_PATH=/home/dev/.cache/ms-playwright \
  pnpm --filter @evenup/web exec playwright test --project=chromium
```

Expected totals: core 264, i18n 31, web 62, api 204, e2e 29. Report chromium-only
e2e coverage explicitly — firefox, webkit and the mobile projects are declared in
the config but not installed in this environment.

- [ ] **Confirm the data migration actually cleaned the existing rows**

```bash
pnpm --filter @evenup/db exec prisma migrate status
```

Expected: schema up to date, no drift. On a database that held settlements before
this work, `SELECT count(*) FROM "Transaction" WHERE title = 'Settlement'` must
return 0.
