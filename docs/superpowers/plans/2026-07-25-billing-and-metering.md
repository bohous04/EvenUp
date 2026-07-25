# Billing & Metering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace bring-your-own-key OCR with a metered model — a paid VIP subscription (150 scans/period) and prepaid scan credits — billed through Stripe.

**Architecture:** One pure `resolveScanEntitlement()` decides whether a scan proceeds and what it consumes; an append-only `ScanLedger` records every balance change with a denormalised `User.creditBalance` for fast checks. Stripe hosted Checkout handles payment, a signature-verified webhook applies effects idempotently. Billing is inert without `STRIPE_SECRET_KEY`, so self-hosting is unaffected.

**Tech Stack:** TypeScript, pnpm + Turborepo, Prisma/PostgreSQL, tRPC, Vitest, Next.js App Router, Stripe Node SDK.

**Spec:** `docs/superpowers/specs/2026-07-25-billing-and-metering-design.md`

## Global Constraints

- **Money is integer minor units.** Never floats. `@evenup/core` owns the arithmetic; follow it.
- **All user-facing strings go through `@evenup/i18n`**, added to **both** `packages/i18n/src/locales/cs.ts` and `en.ts`. Czech is `DEFAULT_LOCALE`. A key present in one catalog and missing from the other is a bug.
- **Router error messages are thrown in plain English** and localised by the `errorFormatter` in `packages/api/src/trpc.ts:23-30` via the `errors.*` keys. New error messages need matching `errors.*` entries in both catalogs.
- **Prettier must pass**: `pnpm format:check`. Run `pnpm format` before committing.
- **Typecheck must pass**: `pnpm typecheck`.
- **Never log or return secrets.** Existing tests assert encrypted fields never appear in responses — follow that pattern.
- **Billing must be inert without `STRIPE_SECRET_KEY`.** Every entitlement path must keep working for a self-hoster with only an instance OCR key.
- **Prices are configuration, never hardcoded literals in business logic.**

## Test environment (devbox)

The repo ships no `.env` and no test database. Before running any API test:

```bash
docker run -d --name evenup-testpg -e POSTGRES_PASSWORD=evenup \
  -e POSTGRES_USER=evenup -e POSTGRES_DB=evenup -p 5442:5432 postgres:16-alpine
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' evenup-testpg
```

Use the **container IP**, not localhost. Then:

```bash
cp .env.example .env
# set DATABASE_URL to postgresql://evenup:evenup@<container-ip>:5432/evenup
export ENCRYPTION_KEY=$(openssl rand -hex 32)
export BETTER_AUTH_SECRET=$(openssl rand -hex 32)
pnpm --filter @evenup/db exec prisma migrate deploy
pnpm --filter @evenup/db exec prisma generate   # skipping this fails 10 of 16 API test files
```

Do **not** `source .env` in zsh — it trips a parse error around line 57. Export the vars individually.

Green baseline before starting: core 262, i18n 31, web 62, api 195, e2e 29 (chromium).

## File Structure

| File | Responsibility |
|---|---|
| `packages/db/prisma/schema.prisma` | `Subscription`, `ScanLedger`, new `User` fields |
| `packages/api/src/billing/entitlement.ts` | pure decision function — no I/O |
| `packages/api/src/billing/ledger.ts` | atomic reserve / refund / credit, writes ledger rows |
| `packages/api/src/billing/prices.ts` | price catalogue read from config |
| `packages/api/src/billing/stripe.ts` | Stripe client factory; returns `null` when unconfigured |
| `packages/api/src/routers/billing.ts` | tRPC: checkout sessions, portal, balance |
| `apps/web/src/app/api/stripe/webhook/route.ts` | signature-verified webhook |
| `packages/api/src/services/account.ts` | amended: selective erasure |
| `packages/api/src/routers/ocr.ts` | amended: entitlement replaces key resolution |

Entitlement is deliberately separate from the ledger: the decision is pure and exhaustively testable, the mutation is not.

---

### Task 1: Schema and migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_billing/migration.sql` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma models `Subscription`, `ScanLedger`, enum `LedgerReason`; `User.stripeCustomerId`, `User.creditBalance`, `User.ocrConsentAt`.

- [ ] **Step 1: Add the models to `schema.prisma`**

Add to the `User` model, next to the existing `isVip` field:

```prisma
  stripeCustomerId String?   @unique
  creditBalance    Int       @default(0) // scans remaining; never expires
  ocrConsentAt     DateTime? // explicit consent to send receipts to the OCR provider
```

Add these models at the end of the file:

```prisma
enum LedgerReason {
  PURCHASE
  VIP_SCAN
  CREDIT_SCAN
  REFUND
  ADMIN_GRANT
}

model Subscription {
  id                   String    @id @default(cuid())
  // Nullable so a deleted account can retain the billing record (GDPR vs
  // accounting-law retention). See services/account.ts.
  userId               String?
  user                 User?     @relation(fields: [userId], references: [id], onDelete: SetNull)
  stripeSubscriptionId String    @unique
  status               String
  currentPeriodStart   DateTime
  currentPeriodEnd     DateTime
  cancelAtPeriodEnd    Boolean   @default(false)
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  @@index([userId])
}

model ScanLedger {
  id            String       @id @default(cuid())
  userId        String?
  user          User?        @relation(fields: [userId], references: [id], onDelete: SetNull)
  /// +n for purchases and grants, -1 for a credit-funded scan, 0 for a
  /// subscription scan (which is counted, not charged). The invariant is
  /// User.creditBalance == sum(delta).
  delta         Int
  reason        LedgerReason
  /// Stripe event id; unique so a replayed webhook cannot double-credit.
  stripeEventId String?      @unique
  receiptId     String?
  /// Set on PURCHASE rows: the customer acknowledged immediate performance and
  /// the loss of the 14-day withdrawal right. Required by EU distance selling.
  withdrawalConsentAt DateTime?
  createdAt     DateTime     @default(now())

  @@index([userId, createdAt])
  @@index([userId, reason, createdAt])
}
```

Add the back-relations to `User`:

```prisma
  subscriptions Subscription[]
  scanLedger    ScanLedger[]
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @evenup/db exec prisma migrate dev --name billing`
Expected: a new folder under `packages/db/prisma/migrations/` and "Your database is now in sync with your schema."

- [ ] **Step 3: Regenerate the client**

Run: `pnpm --filter @evenup/db exec prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 4: Verify existing tests still pass**

Run: `pnpm --filter @evenup/api test`
Expected: 195 passing. A schema addition must not break anything.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): subscription, scan ledger and billing fields on user"
```

---

### Task 2: The entitlement function

**Files:**
- Create: `packages/api/src/billing/entitlement.ts`
- Test: `packages/api/src/billing/entitlement.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:

```ts
export const VIP_SCANS_PER_PERIOD = 150;
export type Consume = 'NONE' | 'VIP_SCAN' | 'CREDIT';
export interface Entitlement {
  allow: boolean;
  consume?: Consume;
  mayStoreImage: boolean;
  reason?: 'NO_ENTITLEMENT';
}
export interface EntitlementInput {
  billingEnabled: boolean;
  isVip: boolean;
  creditBalance: number;
  subscription: { status: string; currentPeriodStart: Date; currentPeriodEnd: Date } | null;
  vipScansUsedThisPeriod: number;
  now: Date;
}
export function resolveScanEntitlement(input: EntitlementInput): Entitlement;
```

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/billing/entitlement.test.ts`:

```ts
/** Entitlement decisions: the single source of truth for who may scan. */
import { describe, expect, it } from 'vitest';
import { resolveScanEntitlement, VIP_SCANS_PER_PERIOD } from './entitlement.js';

const now = new Date('2026-07-15T12:00:00Z');
const activeSub = {
  status: 'active',
  currentPeriodStart: new Date('2026-07-01T00:00:00Z'),
  currentPeriodEnd: new Date('2026-08-01T00:00:00Z'),
};
const base = {
  billingEnabled: true,
  isVip: false,
  creditBalance: 0,
  subscription: null,
  vipScansUsedThisPeriod: 0,
  now,
};

describe('resolveScanEntitlement', () => {
  it('allows everything when billing is disabled (self-hosting)', () => {
    const r = resolveScanEntitlement({ ...base, billingEnabled: false });
    expect(r).toMatchObject({ allow: true, consume: 'NONE', mayStoreImage: true });
  });

  it('allows comped VIPs without consuming anything', () => {
    const r = resolveScanEntitlement({ ...base, isVip: true });
    expect(r).toMatchObject({ allow: true, consume: 'NONE', mayStoreImage: true });
  });

  it('consumes a VIP scan for an active subscriber under the cap', () => {
    const r = resolveScanEntitlement({ ...base, subscription: activeSub });
    expect(r).toMatchObject({ allow: true, consume: 'VIP_SCAN', mayStoreImage: true });
  });

  it('falls through to credits once the cap is reached', () => {
    const r = resolveScanEntitlement({
      ...base,
      subscription: activeSub,
      vipScansUsedThisPeriod: VIP_SCANS_PER_PERIOD,
      creditBalance: 3,
    });
    expect(r).toMatchObject({ allow: true, consume: 'CREDIT' });
  });

  it('refuses at the cap with no credits', () => {
    const r = resolveScanEntitlement({
      ...base,
      subscription: activeSub,
      vipScansUsedThisPeriod: VIP_SCANS_PER_PERIOD,
    });
    expect(r).toMatchObject({ allow: false, reason: 'NO_ENTITLEMENT' });
  });

  it('ignores a subscription that is not active', () => {
    const r = resolveScanEntitlement({
      ...base,
      subscription: { ...activeSub, status: 'past_due' },
      creditBalance: 1,
    });
    expect(r).toMatchObject({ allow: true, consume: 'CREDIT' });
  });

  it('ignores a subscription whose period has ended', () => {
    const r = resolveScanEntitlement({
      ...base,
      subscription: { ...activeSub, currentPeriodEnd: new Date('2026-07-10T00:00:00Z') },
    });
    expect(r).toMatchObject({ allow: false });
  });

  it('consumes a credit when there is no subscription', () => {
    const r = resolveScanEntitlement({ ...base, creditBalance: 1 });
    expect(r).toMatchObject({ allow: true, consume: 'CREDIT' });
  });

  it('denies image storage to credit-funded scans', () => {
    const r = resolveScanEntitlement({ ...base, creditBalance: 1 });
    expect(r.mayStoreImage).toBe(false);
  });

  it('refuses with no subscription and no credits', () => {
    expect(resolveScanEntitlement(base)).toMatchObject({
      allow: false,
      reason: 'NO_ENTITLEMENT',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @evenup/api test entitlement`
Expected: FAIL — "Failed to resolve import ./entitlement.js".

- [ ] **Step 3: Implement**

Create `packages/api/src/billing/entitlement.ts`:

```ts
/**
 * Who may scan a receipt, and what it costs them. Pure — no I/O — so the whole
 * decision matrix is unit-testable. Every caller must go through this; nothing
 * else should read `isVip` or `creditBalance` to make an access decision.
 */

/** Scans included in a subscription period. Beyond this, credits are used. */
export const VIP_SCANS_PER_PERIOD = 150;

export type Consume = 'NONE' | 'VIP_SCAN' | 'CREDIT';

export interface Entitlement {
  readonly allow: boolean;
  readonly consume?: Consume;
  /** Receipt images are retained for subscribers and comped users only. */
  readonly mayStoreImage: boolean;
  readonly reason?: 'NO_ENTITLEMENT';
}

export interface EntitlementInput {
  /** False when STRIPE_SECRET_KEY is unset — i.e. a self-hosted instance. */
  readonly billingEnabled: boolean;
  /** The comp override: free, uncapped, no Stripe involvement. */
  readonly isVip: boolean;
  readonly creditBalance: number;
  readonly subscription: {
    readonly status: string;
    readonly currentPeriodStart: Date;
    readonly currentPeriodEnd: Date;
  } | null;
  readonly vipScansUsedThisPeriod: number;
  readonly now: Date;
}

const DENIED: Entitlement = { allow: false, mayStoreImage: false, reason: 'NO_ENTITLEMENT' };

function isSubscriptionUsable(sub: EntitlementInput['subscription'], now: Date): boolean {
  if (!sub) return false;
  if (sub.status !== 'active') return false;
  return sub.currentPeriodStart <= now && now < sub.currentPeriodEnd;
}

export function resolveScanEntitlement(input: EntitlementInput): Entitlement {
  // 1. Self-hosting: no billing configured, so nothing is metered.
  if (!input.billingEnabled) return { allow: true, consume: 'NONE', mayStoreImage: true };

  // 2. Comp override — testers, friends, the operator.
  if (input.isVip) return { allow: true, consume: 'NONE', mayStoreImage: true };

  // 3. Subscription allowance.
  if (
    isSubscriptionUsable(input.subscription, input.now) &&
    input.vipScansUsedThisPeriod < VIP_SCANS_PER_PERIOD
  ) {
    return { allow: true, consume: 'VIP_SCAN', mayStoreImage: true };
  }

  // 4. Prepaid credits. Reaching here from step 3 *is* the "fall back to
  //    credits at the cap" behaviour; it needs no special case.
  if (input.creditBalance > 0) {
    return { allow: true, consume: 'CREDIT', mayStoreImage: false };
  }

  return DENIED;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @evenup/api test entitlement`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/api/src/billing/entitlement.ts packages/api/src/billing/entitlement.test.ts
git commit -m "feat(billing): pure scan-entitlement resolver"
```

---

### Task 3: Ledger service

**Files:**
- Create: `packages/api/src/billing/ledger.ts`
- Test: `packages/api/src/billing/ledger.test.ts`

**Interfaces:**
- Consumes: `LedgerReason` from `@evenup/db`.
- Produces:

```ts
export function reserveCredit(prisma: PrismaClient, userId: string): Promise<boolean>;
export function refundCredit(prisma: PrismaClient, userId: string): Promise<void>;
export function recordVipScan(prisma: PrismaClient, userId: string): Promise<void>;
export function creditPurchase(prisma: PrismaClient, args: {
  userId: string; scans: number; stripeEventId: string; withdrawalConsentAt: Date;
}): Promise<boolean>;
export function grantCredits(prisma: PrismaClient, userId: string, scans: number): Promise<void>;
export function countVipScansInPeriod(
  prisma: PrismaClient, userId: string, from: Date, to: Date,
): Promise<number>;
```

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/billing/ledger.test.ts`:

```ts
/** Ledger invariants: the balance always equals the sum of deltas. */
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestUser, testPrisma, resetDb } from '../test/harness.js';
import {
  reserveCredit,
  refundCredit,
  recordVipScan,
  creditPurchase,
  countVipScansInPeriod,
} from './ledger.js';

async function balance(userId: string) {
  const u = await testPrisma.user.findUniqueOrThrow({ where: { id: userId } });
  return u.creditBalance;
}

async function ledgerSum(userId: string) {
  const rows = await testPrisma.scanLedger.findMany({ where: { userId } });
  return rows.reduce((n, r) => n + r.delta, 0);
}

describe('ledger', () => {
  beforeEach(resetDb);

  it('refuses to reserve when the balance is zero', async () => {
    const u = await createTestUser('a@example.com');
    expect(await reserveCredit(testPrisma, u.id)).toBe(false);
    expect(await balance(u.id)).toBe(0);
  });

  it('reserves a credit and records it', async () => {
    const u = await createTestUser('a@example.com');
    await testPrisma.user.update({ where: { id: u.id }, data: { creditBalance: 2 } });
    expect(await reserveCredit(testPrisma, u.id)).toBe(true);
    expect(await balance(u.id)).toBe(1);
  });

  it('refunds a reserved credit', async () => {
    const u = await createTestUser('a@example.com');
    await testPrisma.user.update({ where: { id: u.id }, data: { creditBalance: 1 } });
    await reserveCredit(testPrisma, u.id);
    await refundCredit(testPrisma, u.id);
    expect(await balance(u.id)).toBe(1);
  });

  it('never goes negative under concurrent reservations', async () => {
    const u = await createTestUser('a@example.com');
    await testPrisma.user.update({ where: { id: u.id }, data: { creditBalance: 1 } });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => reserveCredit(testPrisma, u.id)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await balance(u.id)).toBe(0);
  });

  it('credits a purchase exactly once for a replayed event', async () => {
    const u = await createTestUser('a@example.com');
    const args = {
      userId: u.id,
      scans: 5,
      stripeEventId: 'evt_1',
      withdrawalConsentAt: new Date(),
    };
    expect(await creditPurchase(testPrisma, args)).toBe(true);
    expect(await creditPurchase(testPrisma, args)).toBe(false);
    expect(await balance(u.id)).toBe(5);
  });

  it('keeps the balance equal to the sum of ledger deltas', async () => {
    const u = await createTestUser('a@example.com');
    await creditPurchase(testPrisma, {
      userId: u.id,
      scans: 3,
      stripeEventId: 'evt_2',
      withdrawalConsentAt: new Date(),
    });
    await reserveCredit(testPrisma, u.id);
    expect(await balance(u.id)).toBe(await ledgerSum(u.id));
  });

  it('counts only VIP scans inside the period', async () => {
    const u = await createTestUser('a@example.com');
    await recordVipScan(testPrisma, u.id);
    const from = new Date(Date.now() - 60_000);
    const to = new Date(Date.now() + 60_000);
    expect(await countVipScansInPeriod(testPrisma, u.id, from, to)).toBe(1);
    const future = new Date(Date.now() + 120_000);
    expect(await countVipScansInPeriod(testPrisma, u.id, future, future)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @evenup/api test ledger`
Expected: FAIL — cannot resolve `./ledger.js`.

- [ ] **Step 3: Implement**

Create `packages/api/src/billing/ledger.ts`:

```ts
/**
 * Credit balance mutations. `User.creditBalance` is denormalised for a cheap
 * pre-scan check, but every change writes a `ScanLedger` row in the same
 * transaction, so the balance is always reconstructible from the ledger.
 */
import { LedgerReason, type PrismaClient } from '@evenup/db';

/**
 * Atomically take one credit. Returns false when the balance is zero.
 * The conditional `updateMany` is what makes concurrent scans safe: only one
 * caller can win the row when a single credit remains.
 */
export async function reserveCredit(prisma: PrismaClient, userId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({
      where: { id: userId, creditBalance: { gt: 0 } },
      data: { creditBalance: { decrement: 1 } },
    });
    if (count === 0) return false;
    await tx.scanLedger.create({
      data: { userId, delta: -1, reason: LedgerReason.CREDIT_SCAN },
    });
    return true;
  });
}

/** Give back a credit taken by `reserveCredit` when the scan failed. */
export async function refundCredit(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { creditBalance: { increment: 1 } },
    });
    await tx.scanLedger.create({
      data: { userId, delta: 1, reason: LedgerReason.REFUND },
    });
  });
}

/**
 * Record a scan covered by the subscription allowance. No reservation: VIP
 * usage is counted from the ledger, and overshooting the cap by one under
 * concurrency costs a fraction of a crown.
 */
export async function recordVipScan(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.scanLedger.create({
    data: { userId, delta: 0, reason: LedgerReason.VIP_SCAN },
  });
}

/**
 * Apply a completed purchase. Returns false if this Stripe event was already
 * applied — the unique constraint on `stripeEventId` makes replay a no-op at
 * the database rather than in application logic.
 */
export async function creditPurchase(
  prisma: PrismaClient,
  args: {
    userId: string;
    scans: number;
    stripeEventId: string;
    withdrawalConsentAt: Date;
  },
): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.scanLedger.create({
        data: {
          userId: args.userId,
          delta: args.scans,
          reason: LedgerReason.PURCHASE,
          stripeEventId: args.stripeEventId,
          withdrawalConsentAt: args.withdrawalConsentAt,
        },
      });
      await tx.user.update({
        where: { id: args.userId },
        data: { creditBalance: { increment: args.scans } },
      });
    });
    return true;
  } catch (err) {
    // P2002 = unique constraint violation on stripeEventId: already applied.
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
      return false;
    }
    throw err;
  }
}

/** Admin remedy: hand a user credits (e.g. after a lost-credit incident). */
export async function grantCredits(
  prisma: PrismaClient,
  userId: string,
  scans: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.scanLedger.create({
      data: { userId, delta: scans, reason: LedgerReason.ADMIN_GRANT },
    });
    await tx.user.update({
      where: { id: userId },
      data: { creditBalance: { increment: scans } },
    });
  });
}

/** How many subscription scans the user has used in the given period. */
export async function countVipScansInPeriod(
  prisma: PrismaClient,
  userId: string,
  from: Date,
  to: Date,
): Promise<number> {
  return prisma.scanLedger.count({
    where: { userId, reason: LedgerReason.VIP_SCAN, createdAt: { gte: from, lt: to } },
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @evenup/api test ledger`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/api/src/billing/ledger.ts packages/api/src/billing/ledger.test.ts
git commit -m "feat(billing): credit ledger with atomic reserve and idempotent purchase"
```

---

### Task 4: Price catalogue and Stripe client

**Files:**
- Create: `packages/api/src/billing/prices.ts`
- Create: `packages/api/src/billing/stripe.ts`
- Test: `packages/api/src/billing/prices.test.ts`
- Modify: `packages/api/package.json` (add `stripe`)
- Modify: `.env.example`

**Interfaces:**
- Produces:

```ts
export type BillingCurrency = 'CZK' | 'EUR';
export interface CreditPack { id: string; scans: number; priceId: string }
export function currencyForLocale(locale: string): BillingCurrency;
export function creditPacks(currency: BillingCurrency): CreditPack[];
export function subscriptionPriceId(currency: BillingCurrency): string | null;
export function packById(currency: BillingCurrency, id: string): CreditPack | undefined;
export function isBillingEnabled(): boolean;
export function getStripe(): Stripe | null;
```

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @evenup/api add stripe`
Expected: `stripe` appears in `packages/api/package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `packages/api/src/billing/prices.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { currencyForLocale, creditPacks, packById, isBillingEnabled } from './prices.js';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('prices', () => {
  it('maps locale to currency, defaulting to CZK', () => {
    expect(currencyForLocale('cs')).toBe('CZK');
    expect(currencyForLocale('en')).toBe('EUR');
    expect(currencyForLocale('zz')).toBe('CZK');
  });

  it('reports billing disabled without a secret key', () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(isBillingEnabled()).toBe(false);
  });

  it('exposes only packs that have a configured price id', () => {
    process.env.STRIPE_PRICE_CZK_PACK_5 = 'price_czk_5';
    delete process.env.STRIPE_PRICE_CZK_PACK_2;
    delete process.env.STRIPE_PRICE_CZK_PACK_10;
    const packs = creditPacks('CZK');
    expect(packs.map((p) => p.id)).toEqual(['pack5']);
    expect(packs[0]).toMatchObject({ scans: 5, priceId: 'price_czk_5' });
  });

  it('looks a pack up by id', () => {
    process.env.STRIPE_PRICE_EUR_PACK_10 = 'price_eur_10';
    expect(packById('EUR', 'pack10')?.scans).toBe(10);
    expect(packById('EUR', 'nope')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @evenup/api test prices`
Expected: FAIL — cannot resolve `./prices.js`.

- [ ] **Step 4: Implement the price catalogue**

Create `packages/api/src/billing/prices.ts`:

```ts
/**
 * Price catalogue. Everything is read from configuration so prices can be
 * retuned without a deploy; nothing here hardcodes an amount. Amounts live in
 * Stripe — this module only maps our product ids to Stripe price ids.
 */

export type BillingCurrency = 'CZK' | 'EUR';

export interface CreditPack {
  /** Stable identifier used by the client to request a checkout session. */
  readonly id: string;
  readonly scans: number;
  readonly priceId: string;
}

/** Czech pages are priced in CZK, everything else in EUR. */
export function currencyForLocale(locale: string): BillingCurrency {
  return locale === 'en' ? 'EUR' : 'CZK';
}

/** Billing is inert — and self-hosting therefore unaffected — without this. */
export function isBillingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function subscriptionPriceId(currency: BillingCurrency): string | null {
  return process.env[`STRIPE_PRICE_${currency}_VIP`] ?? null;
}

const PACK_SIZES = [2, 5, 10] as const;

/** Packs with a configured price id, smallest first. */
export function creditPacks(currency: BillingCurrency): CreditPack[] {
  return PACK_SIZES.flatMap((scans) => {
    const priceId = process.env[`STRIPE_PRICE_${currency}_PACK_${scans}`];
    return priceId ? [{ id: `pack${scans}`, scans, priceId }] : [];
  });
}

export function packById(currency: BillingCurrency, id: string): CreditPack | undefined {
  return creditPacks(currency).find((p) => p.id === id);
}
```

- [ ] **Step 5: Implement the Stripe client**

Create `packages/api/src/billing/stripe.ts`:

```ts
/**
 * Stripe client factory. Returns null when unconfigured so every caller is
 * forced to handle the self-hosted case rather than crashing on boot.
 */
import Stripe from 'stripe';

let cached: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  cached = key ? new Stripe(key) : null;
  return cached;
}

/** Test seam: forget the memoised client after changing env vars. */
export function resetStripeForTests(): void {
  cached = undefined;
}
```

- [ ] **Step 6: Document the configuration**

Append to `.env.example`:

```bash
# --- Billing (hosted instance only) ------------------------------------------
# Without STRIPE_SECRET_KEY all billing is inert and every signed-in user may
# scan using the instance OCR key — which is the self-hosting default.
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
# Stripe price ids. Amounts live in Stripe, not here.
STRIPE_PRICE_CZK_VIP=
STRIPE_PRICE_EUR_VIP=
STRIPE_PRICE_CZK_PACK_2=
STRIPE_PRICE_CZK_PACK_5=
STRIPE_PRICE_CZK_PACK_10=
STRIPE_PRICE_EUR_PACK_2=
STRIPE_PRICE_EUR_PACK_5=
STRIPE_PRICE_EUR_PACK_10=
# Absolute base URL for Stripe return/cancel links, e.g. https://evenup.cz
BILLING_RETURN_URL=
```

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm --filter @evenup/api test prices`
Expected: PASS — 4 tests.

- [ ] **Step 8: Commit**

```bash
pnpm format
git add packages/api/src/billing/prices.ts packages/api/src/billing/stripe.ts \
        packages/api/src/billing/prices.test.ts packages/api/package.json .env.example pnpm-lock.yaml
git commit -m "feat(billing): configurable price catalogue and optional stripe client"
```

---

### Task 5: Entitlement in the OCR router

**Files:**
- Modify: `packages/api/src/routers/ocr.ts:52-102`
- Create: `packages/api/src/billing/scan-access.ts`
- Test: `packages/api/src/billing/scan-access.test.ts`

**Interfaces:**
- Consumes: `resolveScanEntitlement`, `countVipScansInPeriod` from Tasks 2–3.
- Produces:

```ts
export function loadEntitlement(
  prisma: PrismaClient, userId: string, now: Date,
): Promise<Entitlement>;
```

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/billing/scan-access.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @evenup/api test scan-access`
Expected: FAIL — cannot resolve `./scan-access.js`.

- [ ] **Step 3: Implement the loader**

Create `packages/api/src/billing/scan-access.ts`:

```ts
/**
 * Gathers the state `resolveScanEntitlement` needs and asks it for a decision.
 * Keeping the I/O here leaves the decision itself pure and exhaustively tested.
 */
import type { PrismaClient } from '@evenup/db';
import { resolveScanEntitlement, type Entitlement } from './entitlement.js';
import { countVipScansInPeriod } from './ledger.js';
import { isBillingEnabled } from './prices.js';

export async function loadEntitlement(
  prisma: PrismaClient,
  userId: string,
  now: Date,
): Promise<Entitlement> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { isVip: true, creditBalance: true },
  });

  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: 'active' },
    orderBy: { currentPeriodEnd: 'desc' },
    select: { status: true, currentPeriodStart: true, currentPeriodEnd: true },
  });

  const vipScansUsedThisPeriod = subscription
    ? await countVipScansInPeriod(
        prisma,
        userId,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
      )
    : 0;

  return resolveScanEntitlement({
    billingEnabled: isBillingEnabled(),
    isVip: user.isVip,
    creditBalance: user.creditBalance,
    subscription,
    vipScansUsedThisPeriod,
    now,
  });
}
```

- [ ] **Step 4: Rewrite the key-resolution block in `ocr.ts`**

Replace the whole `if (user.openRouterKeyEncrypted) { ... } else { ... }` block (`packages/api/src/routers/ocr.ts:60-81`) with:

```ts
      // Entitlement (paid tiers) replaces the old BYO-key resolution: the
      // instance key is the only key now, and access is metered.
      const entitlement = await loadEntitlement(ctx.prisma, ctx.user.id, new Date());
      if (!entitlement.allow) {
        throw new TRPCError({
          code: 'PAYMENT_REQUIRED',
          message: 'No scans remaining. Subscribe or buy credits to continue.',
        });
      }

      const cfg = await ctx.prisma.instanceConfig.findUnique({ where: { id: 'singleton' } });
      if (!cfg?.openRouterKeyEncrypted) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'No shared OpenRouter key is configured; ask an admin.',
        });
      }
      const apiKey = ctx.secretBox.decrypt(cfg.openRouterKeyEncrypted);
      const model = user.ocrModel ?? cfg.ocrModel ?? DEFAULT_OCR_MODEL;

      // Reserve before spending money at OpenRouter so concurrent scans cannot
      // overdraw a single credit. Refunded below if the scan throws.
      if (entitlement.consume === 'CREDIT') {
        const reserved = await reserveCredit(ctx.prisma, ctx.user.id);
        if (!reserved) {
          throw new TRPCError({
            code: 'PAYMENT_REQUIRED',
            message: 'No scans remaining. Subscribe or buy credits to continue.',
          });
        }
      }
```

Change the `user` select on `ocr.ts:57` to drop the removed field:

```ts
        select: { ocrModel: true },
```

Wrap the existing `try { const result = await extractReceipt(...)` so the `catch` refunds. Add to the existing `catch (err)` block, as its first statement:

```ts
        if (entitlement.consume === 'CREDIT') {
          await refundCredit(ctx.prisma, ctx.user.id);
        }
```

After `extractReceipt` succeeds, record subscription usage:

```ts
        if (entitlement.consume === 'VIP_SCAN') {
          await recordVipScan(ctx.prisma, ctx.user.id);
        }
```

Change the image-storage condition at `ocr.ts:102` from `user.isVip` to the entitlement:

```ts
        if (ctx.objectStore && entitlement.mayStoreImage) {
```

Add the imports at the top of `ocr.ts`:

```ts
import { loadEntitlement } from '../billing/scan-access.js';
import { reserveCredit, refundCredit, recordVipScan } from '../billing/ledger.js';
```

- [ ] **Step 5: Add the error strings**

Add to `packages/i18n/src/locales/cs.ts` and `en.ts` respectively:

```ts
  'errors.noScansRemaining': 'Nemáte žádné skeny. Předplaťte si VIP nebo dokupte kredit.',
```

```ts
  'errors.noScansRemaining': 'No scans remaining. Subscribe or buy credits to continue.',
```

The English value must match the thrown message **exactly** — `trpc.ts:14-19` builds a reverse map from it.

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @evenup/api test`
Expected: PASS. Existing OCR tests that relied on a per-user BYO key will fail — update them to set the instance key via `testPrisma.instanceConfig.upsert` and to give the user credits or `isVip`.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add packages/api/src/billing/scan-access.ts packages/api/src/billing/scan-access.test.ts \
        packages/api/src/routers/ocr.ts packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts
git commit -m "feat(ocr): meter scans through the entitlement resolver"
```

---

### Task 6: OCR consent gate

**Files:**
- Modify: `packages/api/src/routers/ocr.ts`
- Modify: `packages/api/src/routers/user.ts`
- Test: `packages/api/src/routers/ocr.test.ts`

**Interfaces:**
- Consumes: `User.ocrConsentAt` from Task 1.
- Produces: `user.setOcrConsent({ granted: boolean })` mutation.

- [ ] **Step 1: Write the failing test**

Add to `packages/api/src/routers/ocr.test.ts`:

```ts
it('refuses to scan without OCR consent', async () => {
  const u = await createTestUser('a@example.com');
  await testPrisma.user.update({ where: { id: u.id }, data: { isVip: true } });
  const group = await createTestGroup(u);
  await expect(
    makeCaller(u).ocr.scan({ groupId: group.id, imageDataUrl: 'data:image/png;base64,AA==' }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

it('allows scanning once consent is granted and revokes it again', async () => {
  const u = await createTestUser('a@example.com');
  await makeCaller(u).user.setOcrConsent({ granted: true });
  const after = await testPrisma.user.findUniqueOrThrow({ where: { id: u.id } });
  expect(after.ocrConsentAt).not.toBeNull();
  await makeCaller(u).user.setOcrConsent({ granted: false });
  const revoked = await testPrisma.user.findUniqueOrThrow({ where: { id: u.id } });
  expect(revoked.ocrConsentAt).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @evenup/api test ocr`
Expected: FAIL — `user.setOcrConsent` is not a function.

- [ ] **Step 3: Add the consent mutation**

Add to `packages/api/src/routers/user.ts` inside the router object:

```ts
  /**
   * Explicit consent to send receipt images to the OCR provider. Receipts can
   * disclose special-category data (a pharmacy purchase reveals health
   * information), so this is opt-in and revocable rather than implied.
   */
  setOcrConsent: protectedProcedure
    .input(z.object({ granted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { ocrConsentAt: input.granted ? new Date() : null },
      });
      return { ok: true };
    }),
```

- [ ] **Step 4: Gate the scan**

In `packages/api/src/routers/ocr.ts`, extend the user select to include `ocrConsentAt`, and immediately after the group-access check add:

```ts
      if (!user.ocrConsentAt) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Receipt scanning requires your consent to send the image to our OCR provider.',
        });
      }
```

- [ ] **Step 5: Add the strings**

`cs.ts`:

```ts
  'errors.ocrConsentRequired':
    'Skenování účtenek vyžaduje váš souhlas s odesláním obrázku našemu poskytovateli OCR.',
```

`en.ts` (must match the thrown message exactly):

```ts
  'errors.ocrConsentRequired':
    'Receipt scanning requires your consent to send the image to our OCR provider.',
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @evenup/api test ocr`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add packages/api/src/routers/ocr.ts packages/api/src/routers/user.ts \
        packages/api/src/routers/ocr.test.ts packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts
git commit -m "feat(ocr): require explicit, revocable consent before scanning"
```

---

### Task 7: Billing router — checkout and portal

**Files:**
- Create: `packages/api/src/routers/billing.ts`
- Modify: `packages/api/src/routers/index.ts` (register the router)
- Test: `packages/api/src/routers/billing.test.ts`

**Interfaces:**
- Consumes: `getStripe`, `creditPacks`, `packById`, `subscriptionPriceId`, `currencyForLocale`.
- Produces: `billing.summary`, `billing.checkoutSubscription`, `billing.checkoutCredits`, `billing.portal`.

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/routers/billing.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestUser, testPrisma, makeCaller, resetDb } from '../test/harness.js';
import { resetStripeForTests } from '../billing/stripe.js';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  // getStripe() memoises the client, so a test that ran without a key would
  // otherwise poison every later test that sets one.
  resetStripeForTests();
});

describe('billing router', () => {
  beforeEach(() => {
    resetStripeForTests();
    return resetDb();
  });

  it('reports the balance and that billing is off when unconfigured', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const u = await createTestUser('a@example.com');
    const res = await makeCaller(u).billing.summary();
    expect(res).toMatchObject({ billingEnabled: false, creditBalance: 0, packs: [] });
  });

  it('reports a credit balance', async () => {
    const u = await createTestUser('a@example.com');
    await testPrisma.user.update({ where: { id: u.id }, data: { creditBalance: 7 } });
    expect((await makeCaller(u).billing.summary()).creditBalance).toBe(7);
  });

  it('refuses a credit checkout without the withdrawal acknowledgement', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_CZK_PACK_5 = 'price_czk_5';
    const u = await createTestUser('a@example.com');
    await expect(
      makeCaller(u).billing.checkoutCredits({ packId: 'pack5', acknowledgeImmediate: false }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('refuses checkout entirely when billing is disabled', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const u = await createTestUser('a@example.com');
    await expect(makeCaller(u).billing.checkoutSubscription()).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @evenup/api test billing`
Expected: FAIL — `billing` is not a property of the caller.

- [ ] **Step 3: Implement the router**

Create `packages/api/src/routers/billing.ts`:

```ts
/**
 * Checkout and subscription management. Payment itself happens on Stripe's
 * hosted pages, so no card data ever reaches this application.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { getStripe } from '../billing/stripe.js';
import {
  creditPacks,
  packById,
  subscriptionPriceId,
  currencyForLocale,
  isBillingEnabled,
} from '../billing/prices.js';

function returnUrl(path: string): string {
  const base = process.env.BILLING_RETURN_URL ?? 'http://localhost:3000';
  return `${base}${path}`;
}

function requireStripe() {
  const stripe = getStripe();
  if (!stripe) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Billing is not configured on this instance.',
    });
  }
  return stripe;
}

/** Reuse the user's Stripe customer, creating one on first purchase. */
async function customerIdFor(ctx: {
  prisma: import('@evenup/db').PrismaClient;
  user: { id: string; email: string };
}): Promise<string> {
  const stripe = requireStripe();
  const existing = await ctx.prisma.user.findUniqueOrThrow({
    where: { id: ctx.user.id },
    select: { stripeCustomerId: true },
  });
  if (existing.stripeCustomerId) return existing.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: ctx.user.email,
    metadata: { userId: ctx.user.id },
  });
  await ctx.prisma.user.update({
    where: { id: ctx.user.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

export const billingRouter = router({
  /** Everything the pricing UI needs in one call. */
  summary: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { creditBalance: true, isVip: true },
    });
    const subscription = await ctx.prisma.subscription.findFirst({
      where: { userId: ctx.user.id, status: 'active' },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
    });
    const currency = currencyForLocale(ctx.locale);
    return {
      billingEnabled: isBillingEnabled(),
      creditBalance: user.creditBalance,
      isVip: user.isVip,
      subscription,
      currency,
      packs: isBillingEnabled() ? creditPacks(currency) : [],
    };
  }),

  checkoutSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const stripe = requireStripe();
    const currency = currencyForLocale(ctx.locale);
    const price = subscriptionPriceId(currency);
    if (!price) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Billing is not configured on this instance.',
      });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: await customerIdFor(ctx),
      line_items: [{ price, quantity: 1 }],
      success_url: returnUrl('/vip?checkout=success'),
      cancel_url: returnUrl('/vip?checkout=cancelled'),
      metadata: { userId: ctx.user.id },
      // REQUIRED: Stripe does NOT copy session-level metadata onto the
      // Subscription it creates. The webhook reads sub.metadata.userId, so
      // without this no Subscription row is ever persisted and VIP never
      // activates — and no test catches it, because webhook tests fabricate
      // the event with metadata already attached.
      subscription_data: { metadata: { userId: ctx.user.id } },
    });
    return { url: session.url };
  }),

  checkoutCredits: protectedProcedure
    .input(z.object({ packId: z.string(), acknowledgeImmediate: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const stripe = requireStripe();
      // EU distance selling: credits are consumed immediately, so the customer
      // must expressly consent to immediate performance and acknowledge losing
      // the 14-day withdrawal right. Without this the purchase is refundable
      // even after the credits are spent.
      if (!input.acknowledgeImmediate) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Acknowledge immediate delivery to continue.',
        });
      }
      const currency = currencyForLocale(ctx.locale);
      const pack = packById(currency, input.packId);
      if (!pack) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown credit pack.' });
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: await customerIdFor(ctx),
        line_items: [{ price: pack.priceId, quantity: 1 }],
        success_url: returnUrl('/vip?checkout=success'),
        cancel_url: returnUrl('/vip?checkout=cancelled'),
        metadata: {
          userId: ctx.user.id,
          scans: String(pack.scans),
          withdrawalConsent: new Date().toISOString(),
        },
      });
      return { url: session.url };
    }),

  /** Stripe's hosted portal handles cancellation and card updates. */
  portal: protectedProcedure.mutation(async ({ ctx }) => {
    const stripe = requireStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: await customerIdFor(ctx),
      return_url: returnUrl('/vip'),
    });
    return { url: session.url };
  }),
});
```

- [ ] **Step 4: Register the router**

In `packages/api/src/routers/index.ts`, import `billingRouter` and add `billing: billingRouter` to the app router object, following the existing style.

- [ ] **Step 5: Add the error strings**

`cs.ts` / `en.ts` — English values must match the thrown messages exactly:

```ts
  'errors.billingNotConfigured': 'Platby nejsou na této instanci nastavené.',
  'errors.acknowledgeImmediate': 'Potvrďte okamžité dodání a pokračujte.',
  'errors.unknownPack': 'Neznámý balíček kreditů.',
```

```ts
  'errors.billingNotConfigured': 'Billing is not configured on this instance.',
  'errors.acknowledgeImmediate': 'Acknowledge immediate delivery to continue.',
  'errors.unknownPack': 'Unknown credit pack.',
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @evenup/api test billing`
Expected: PASS — 4 tests.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add packages/api/src/routers/billing.ts packages/api/src/routers/billing.test.ts \
        packages/api/src/routers/index.ts packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts
git commit -m "feat(billing): checkout sessions for subscription and credit packs"
```

---

### Task 8: Stripe webhook

**Files:**
- Create: `apps/web/src/app/api/stripe/webhook/route.ts`
- Create: `packages/api/src/billing/webhook.ts`
- Test: `packages/api/src/billing/webhook.test.ts`

**Interfaces:**
- Consumes: `creditPurchase` from Task 3.
- Produces: `applyStripeEvent(prisma, event): Promise<void>`.

The handler is split so the effect logic is testable without HTTP: `webhook.ts` holds the logic, `route.ts` only verifies the signature and delegates.

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/billing/webhook.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestUser, testPrisma, resetDb } from '../test/harness.js';
import { applyStripeEvent } from './webhook.js';

function checkoutEvent(userId: string, id = 'evt_1') {
  return {
    id,
    type: 'checkout.session.completed',
    data: {
      object: {
        mode: 'payment',
        metadata: { userId, scans: '5', withdrawalConsent: '2026-07-25T10:00:00.000Z' },
      },
    },
  } as never;
}

describe('applyStripeEvent', () => {
  beforeEach(resetDb);

  it('credits a completed credit-pack purchase', async () => {
    const u = await createTestUser('a@example.com');
    await applyStripeEvent(testPrisma, checkoutEvent(u.id));
    const after = await testPrisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.creditBalance).toBe(5);
  });

  it('is idempotent for a replayed event', async () => {
    const u = await createTestUser('a@example.com');
    await applyStripeEvent(testPrisma, checkoutEvent(u.id));
    await applyStripeEvent(testPrisma, checkoutEvent(u.id));
    const after = await testPrisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.creditBalance).toBe(5);
  });

  it('records the withdrawal consent on the purchase row', async () => {
    const u = await createTestUser('a@example.com');
    await applyStripeEvent(testPrisma, checkoutEvent(u.id));
    const row = await testPrisma.scanLedger.findFirstOrThrow({ where: { userId: u.id } });
    expect(row.withdrawalConsentAt).toEqual(new Date('2026-07-25T10:00:00.000Z'));
  });

  it('upserts a subscription and rolls the period forward', async () => {
    const u = await createTestUser('a@example.com');
    const sub = {
      id: 'evt_sub',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'active',
          current_period_start: 1_760_000_000,
          current_period_end: 1_762_600_000,
          cancel_at_period_end: false,
          metadata: { userId: u.id },
        },
      },
    } as never;
    await applyStripeEvent(testPrisma, sub);
    const saved = await testPrisma.subscription.findUniqueOrThrow({
      where: { stripeSubscriptionId: 'sub_1' },
    });
    expect(saved.status).toBe('active');
  });

  it('ignores event types it does not handle', async () => {
    await expect(
      applyStripeEvent(testPrisma, { id: 'evt_x', type: 'ping', data: { object: {} } } as never),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @evenup/api test webhook`
Expected: FAIL — cannot resolve `./webhook.js`.

- [ ] **Step 3: Implement the effect logic**

Create `packages/api/src/billing/webhook.ts`:

```ts
/**
 * Stripe event effects. Signature verification happens in the route handler;
 * by the time an event reaches here it is trusted. Every effect is idempotent
 * because Stripe retries and replays.
 */
import type Stripe from 'stripe';
import type { PrismaClient } from '@evenup/db';
import { creditPurchase } from './ledger.js';

async function upsertSubscription(
  prisma: PrismaClient,
  sub: Stripe.Subscription & { metadata?: Record<string, string> },
): Promise<void> {
  const userId = sub.metadata?.userId;
  if (!userId) return;
  const data = {
    userId,
    status: sub.status,
    currentPeriodStart: new Date(sub.current_period_start * 1000),
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };
  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: sub.id },
    create: { ...data, stripeSubscriptionId: sub.id },
    update: data,
  });
}

export async function applyStripeEvent(prisma: PrismaClient, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'payment') return; // subscriptions arrive as their own events
      const userId = session.metadata?.userId;
      const scans = Number(session.metadata?.scans ?? 0);
      const consent = session.metadata?.withdrawalConsent;
      if (!userId || !Number.isInteger(scans) || scans <= 0 || !consent) return;
      await creditPurchase(prisma, {
        userId,
        scans,
        stripeEventId: event.id,
        withdrawalConsentAt: new Date(consent),
      });
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await upsertSubscription(prisma, event.data.object as Stripe.Subscription);
      return;
    }
    default:
      return;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @evenup/api test webhook`
Expected: PASS — 5 tests.

- [ ] **Step 5: Add the route handler**

Create `apps/web/src/app/api/stripe/webhook/route.ts`:

```ts
/**
 * Stripe webhook. The signature MUST be verified against the raw body — a
 * re-serialised body fails verification, and skipping verification would make
 * this endpoint forgeable by anyone who knows the URL.
 */
import { prisma } from '@evenup/db';
import { applyStripeEvent, getStripe } from '@evenup/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response('billing disabled', { status: 404 });

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('missing signature', { status: 400 });

  // Raw text, never req.json() — verification is byte-exact.
  const raw = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return new Response('invalid signature', { status: 400 });
  }

  await applyStripeEvent(prisma, event);
  return new Response('ok', { status: 200 });
}
```

- [ ] **Step 6: Export from the API package**

Add to `packages/api/src/index.ts`:

```ts
export { applyStripeEvent } from './billing/webhook.js';
export { getStripe } from './billing/stripe.js';
```

- [ ] **Step 7: Verify the whole suite**

Run: `pnpm --filter @evenup/api test && pnpm typecheck`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
pnpm format
git add packages/api/src/billing/webhook.ts packages/api/src/billing/webhook.test.ts \
        packages/api/src/index.ts apps/web/src/app/api/stripe/webhook/route.ts
git commit -m "feat(billing): signature-verified, idempotent stripe webhook"
```

---

### Task 9: Selective erasure and export

**Files:**
- Modify: `packages/api/src/services/account.ts`
- Modify: `packages/api/src/routers/user.ts:162-204` (`exportData`)
- Test: `packages/api/src/services/account.test.ts`

**Interfaces:**
- Consumes: `ScanLedger`, `Subscription` from Task 1.
- Produces: unchanged signature for `deleteUserAccount`; `exportData` gains `billing`.

- [ ] **Step 1: Write the failing test**

Add to `packages/api/src/services/account.test.ts`:

```ts
it('retains purchase records but removes personal data on deletion', async () => {
  const u = await createTestUser('a@example.com');
  await testPrisma.scanLedger.createMany({
    data: [
      { userId: u.id, delta: 5, reason: 'PURCHASE', stripeEventId: 'evt_keep' },
      { userId: u.id, delta: -1, reason: 'CREDIT_SCAN' },
      { userId: u.id, delta: 0, reason: 'VIP_SCAN' },
    ],
  });

  await deleteUserAccount(testPrisma, u.id);

  expect(await testPrisma.user.findUnique({ where: { id: u.id } })).toBeNull();

  const remaining = await testPrisma.scanLedger.findMany();
  expect(remaining).toHaveLength(1);
  expect(remaining[0]).toMatchObject({ reason: 'PURCHASE', stripeEventId: 'evt_keep' });
  // The retained record must no longer identify a person.
  expect(remaining[0].userId).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @evenup/api test account`
Expected: FAIL — all three ledger rows are deleted (or the user delete errors).

- [ ] **Step 3: Implement selective erasure**

In `packages/api/src/services/account.ts`, immediately before `await tx.user.delete(...)`, add:

```ts
    // Usage rows are personal data with no retention obligation — delete them.
    // PURCHASE rows are accounting records: Czech law requires keeping them and
    // that obligation overrides the right to erasure (GDPR Art. 17(3)(b)). The
    // schema's onDelete: SetNull detaches them from the person as the user row
    // goes, leaving an amount and a Stripe reference that identify no one.
    await tx.scanLedger.deleteMany({
      where: { userId, reason: { not: 'PURCHASE' } },
    });
```

Update the doc comment at the top of the file to mention the retained billing records.

- [ ] **Step 4: Extend the export**

In `packages/api/src/routers/user.ts`, add to the `Promise.all` in `exportData`:

```ts
      ctx.prisma.subscription.findMany({
        where: { userId: ctx.user.id },
        select: {
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      }),
      ctx.prisma.scanLedger.findMany({
        where: { userId: ctx.user.id },
        select: { delta: true, reason: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
```

Destructure the two extra results and include them in the returned object as
`billing: { subscriptions, ledger }`.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @evenup/api test account user`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add packages/api/src/services/account.ts packages/api/src/services/account.test.ts \
        packages/api/src/routers/user.ts
git commit -m "feat(gdpr): selective erasure retaining billing records; export billing data"
```

---

### Task 10: Remove bring-your-own keys

**Files:**
- Modify: `packages/db/prisma/schema.prisma:35` (drop `openRouterKeyEncrypted`)
- Modify: `packages/api/src/routers/user.ts`, `packages/api/src/routers/admin.ts`
- Modify: `apps/web/src/app/settings/page.tsx`
- Create: migration

**⚠️ Destructive:** this deletes every stored user key. They are unusable once the feature is gone, and the spec records this as accepted — but it cannot be undone.

- [ ] **Step 1: Remove the per-user key UI**

In `apps/web/src/app/settings/page.tsx`, delete the OpenRouter API key form and its handlers. Leave the OCR model selector — per-user model choice is independent of key ownership.

- [ ] **Step 2: Remove the mutations that set it**

Remove the `setOpenRouterKey` (and any `clearOpenRouterKey`) procedures from `packages/api/src/routers/user.ts`, and drop `hasOwnKey` from the admin `listUsers` projection in `packages/api/src/routers/admin.ts`.

- [ ] **Step 3: Update the tests that referenced it**

`packages/api/src/routers/admin.test.ts` asserts `hasOwnKey` (around line 26). Replace that assertion with one that the instance key is never leaked:

```ts
    const res = await makeCaller(admin).admin.listUsers();
    expect(JSON.stringify(res.users)).not.toContain('openRouterKeyEncrypted');
```

- [ ] **Step 4: Drop the column**

Remove the `openRouterKeyEncrypted` field from the `User` model in `schema.prisma`, then:

Run: `pnpm --filter @evenup/db exec prisma migrate dev --name drop_user_byo_key`
Expected: a migration containing `ALTER TABLE "User" DROP COLUMN "openRouterKeyEncrypted";`

- [ ] **Step 5: Regenerate and test**

Run: `pnpm --filter @evenup/db exec prisma generate && pnpm --filter @evenup/api test && pnpm typecheck`
Expected: all green.

- [ ] **Step 6: Update the docs**

In `.env.example`, change the OCR section to state that the key is instance-wide and set from `/admin`. Update `docs/SELF_HOSTING.md` and the OCR bullet in `README.md` — both currently promise "your own API key".

- [ ] **Step 7: Commit**

```bash
pnpm format
git add -u
git commit -m "feat(ocr): remove per-user BYO keys in favour of the instance key"
```

---

### Task 11: Admin credit management

**Files:**
- Modify: `packages/api/src/routers/admin.ts`
- Modify: `apps/web/src/app/admin/page.tsx`
- Test: `packages/api/src/routers/admin.test.ts`

**Interfaces:**
- Consumes: `grantCredits` from Task 3.
- Produces: `admin.grantCredits({ userId, scans })`.

- [ ] **Step 1: Write the failing test**

Add to `packages/api/src/routers/admin.test.ts`:

```ts
it('grants credits to a user', async () => {
  const admin = await makeAdmin('admin@example.com');
  const other = await createTestUser('carol@example.com');
  await makeCaller(admin).admin.grantCredits({ userId: other.id, scans: 3 });
  const updated = await testPrisma.user.findUniqueOrThrow({ where: { id: other.id } });
  expect(updated.creditBalance).toBe(3);
});

it('refuses credit grants from non-admins', async () => {
  const nonAdmin = await createTestUser('bob@example.com');
  const other = await createTestUser('carol@example.com');
  await expect(
    makeCaller(nonAdmin).admin.grantCredits({ userId: other.id, scans: 3 }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @evenup/api test admin`
Expected: FAIL — `grantCredits` is not a function.

- [ ] **Step 3: Implement**

Add to `packages/api/src/routers/admin.ts`:

```ts
  /** Manual remedy — e.g. returning a credit lost to a mid-scan crash. */
  grantCredits: adminProcedure
    .input(z.object({ userId: z.string(), scans: z.number().int().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      await grantCredits(ctx.prisma, input.userId, input.scans);
      return { ok: true };
    }),
```

Import it: `import { grantCredits } from '../billing/ledger.js';`

Add `creditBalance: true` to the `listUsers` select so the dashboard can show balances.

- [ ] **Step 4: Surface it in the dashboard**

In `apps/web/src/app/admin/page.tsx`, add a credit-balance column and a small grant control per user, following the existing VIP-toggle pattern in that file.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @evenup/api test admin`
Expected: PASS.

- [ ] **Step 6: Full verification**

Run: `pnpm --filter @evenup/api test && pnpm --filter @evenup/web test && pnpm typecheck && pnpm format:check`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add -u
git commit -m "feat(admin): credit balances and manual grants"
```

---

## Deployment checklist

Not code, but the feature is not live without these:

- Create the Stripe products and prices (VIP monthly, packs of 2/5/10) in **both** CZK and EUR; put the price ids in Coolify.
- Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BILLING_RETURN_URL=https://evenup.cz`.
- Register the webhook endpoint `https://evenup.cz/api/stripe/webhook` for `checkout.session.completed` and `customer.subscription.*`.
- **Coolify's env API updates by key, not row id** — verify no duplicate rows exist for the new variables before trusting an update.
- Enable OpenRouter **no-training / zero-retention** on the account, and pin the model.
- Stripe will not activate live payments without the public terms, privacy and refund pages — those are Spec 2.
