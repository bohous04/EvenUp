# 30-Day Viewable Receipts (MinIO) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Keep receipt images for 30 days (viewable via a secure route), then auto-delete, backed by self-hosted MinIO capped at 50 GB.

**Architecture:** Extend the injectable S3 `ObjectStore` with reads + an in-memory impl for tests; switch the immediate-delete behavior to `RECEIPT_RETENTION_DAYS` (default 30); add a secret-guarded cleanup cron route + a session/group-gated view route; surface a "View receipt" link. No live MinIO in CI (fakes/in-memory).

**Tech Stack:** TypeScript, Next.js 15 App Router, tRPC, Prisma/Postgres, `@aws-sdk/client-s3`, Vitest, Playwright.

## Global Constraints

- Money/other invariants unchanged. Intra-package imports use explicit `.js` extensions; `noUncheckedIndexedAccess` is on.
- **No live external calls in CI:** object storage is injected; tests use the in-memory or fake store. MinIO is never contacted in tests.
- **Best-effort storage:** any put/get/delete failure must never break OCR, expense creation, the transaction list, or the cleanup job (per-row tolerance).
- **Security:** the view route requires a valid session AND group access; the cron route requires `Authorization: Bearer ${CRON_SECRET}` (constant-time compare). No public/presigned URLs.
- **i18n:** new user-facing strings in BOTH `cs.ts` and `en.ts` (en typed against cs).
- **Retention semantics:** `RECEIPT_RETENTION_DAYS` integer, default `30`. `0` = delete immediately after OCR; `>0` = keep N days.
- Conventional commits; NO `Co-Authored-By` trailer.
- Local test DB: `docker run -d --name evenup-dev-db -e POSTGRES_USER=evenup -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=evenup -p 55432:5432 postgres:16-alpine` then `export DATABASE_URL="postgresql://evenup:pass@localhost:55432/evenup"` and `pnpm --filter @evenup/db exec prisma migrate deploy`.

---

## Task 1: ObjectStore.getObject + in-memory store

**Files:** Modify `packages/api/src/storage/object-store.ts`, `packages/api/src/storage/object-store.test.ts`. Modify `packages/api/src/index.ts` (export `createInMemoryObjectStore`).

**Interfaces produced:**
- `ObjectStore.getObject(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null>`
- `createInMemoryObjectStore(): ObjectStore` (module-fresh Map per call)

- [ ] **Step 1: Failing test** — append to `object-store.test.ts`:
```ts
import { createInMemoryObjectStore } from './object-store.js';

describe('createInMemoryObjectStore', () => {
  it('round-trips put -> get and delete -> null', async () => {
    const s = createInMemoryObjectStore();
    await s.putReceipt('receipts/g/a.png', new Uint8Array([1, 2, 3]), 'image/png');
    const got = await s.getObject('receipts/g/a.png');
    expect(got?.contentType).toBe('image/png');
    expect(Array.from(got!.bytes)).toEqual([1, 2, 3]);
    await s.deleteObject('receipts/g/a.png');
    expect(await s.getObject('receipts/g/a.png')).toBeNull();
  });
  it('getObject returns null for a missing key', async () => {
    expect(await createInMemoryObjectStore().getObject('nope')).toBeNull();
  });
});
```
- [ ] **Step 2: Run → fail** — `pnpm --filter @evenup/api exec vitest run src/storage/object-store.test.ts` (Expected: FAIL, `createInMemoryObjectStore` undefined).
- [ ] **Step 3: Implement.** In `object-store.ts`: add `getObject` to the `ObjectStore` interface; implement in `createS3ObjectStore` using `GetObjectCommand` (import it), reading the body via `await Body.transformToByteArray()` and returning `{ bytes, contentType: ContentType ?? 'application/octet-stream' }`, catching `NoSuchKey`/`name==='NoSuchKey'`/`$metadata.httpStatusCode===404` → `null`; `createNoopObjectStore().getObject` → `async () => null`; add:
```ts
export function createInMemoryObjectStore(): ObjectStore {
  const store = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    async putReceipt(key, bytes, contentType) {
      store.set(key, { bytes, contentType });
    },
    async deleteObject(key) {
      store.delete(key);
    },
    async getObject(key) {
      return store.get(key) ?? null;
    },
  };
}
```
- [ ] **Step 4: Run → pass.** Also `pnpm --filter @evenup/api exec tsc --noEmit` clean. Export `createInMemoryObjectStore` from `index.ts`.
- [ ] **Step 5: Commit** — `feat(api): ObjectStore.getObject + in-memory store for receipt viewing`.

---

## Task 2: Web shared object-store resolver + retention/cron env

**Files:** Create `apps/web/src/server/object-store.ts`. Modify `apps/web/src/server/env.ts`, `apps/web/src/server/trpc.ts`, `.env.example`, `docs/SELF_HOSTING.md`.

**Interfaces produced:** `getObjectStore(): ObjectStore` (singleton) — used by the tRPC context, view route, cron route.

- [ ] **Step 1: env.ts** — replace `receiptAutoDelete` with:
```ts
  receiptRetentionDays: Number.parseInt(process.env.RECEIPT_RETENTION_DAYS ?? '30', 10),
  cronSecret: process.env.CRON_SECRET,
```
(keep the `storage` block as-is).
- [ ] **Step 2: Shared resolver** — create `apps/web/src/server/object-store.ts`:
```ts
import 'server-only';
import {
  createS3ObjectStore,
  createNoopObjectStore,
  createInMemoryObjectStore,
  type ObjectStore,
} from '@evenup/api';
import { env } from './env.js';

// One store per server process. In dev/E2E (AUTH_DEV_ECHO) an in-memory store
// makes scan->view round-trip without MinIO; else S3 when configured; else noop.
let store: ObjectStore | undefined;
export function getObjectStore(): ObjectStore {
  if (store) return store;
  if (env.authDevEcho) store = createInMemoryObjectStore();
  else if (env.storage.endpoint && env.storage.accessKey && env.storage.secretKey)
    store = createS3ObjectStore({
      endpoint: env.storage.endpoint,
      region: env.storage.region,
      accessKeyId: env.storage.accessKey,
      secretAccessKey: env.storage.secretKey,
      bucket: env.storage.bucket,
    });
  else store = createNoopObjectStore();
  return store;
}
```
- [ ] **Step 3: trpc.ts** — replace the inline `objectStore` construction with `import { getObjectStore } from './object-store.js';` and `objectStore: getObjectStore(),` in `createContext`.
- [ ] **Step 4: Docs/env** — in `.env.example` replace the `RECEIPT_AUTO_DELETE` line with `RECEIPT_RETENTION_DAYS=30` and add `CRON_SECRET=` (with a comment: set to a random string; used by the receipt-cleanup scheduled task). Update the `docs/SELF_HOSTING.md` row.
- [ ] **Step 5: Verify** — `pnpm --filter @evenup/db exec prisma generate >/dev/null && pnpm turbo run typecheck --filter=@evenup/web`.
- [ ] **Step 6: Commit** — `feat(web): shared object-store resolver + retention/cron env`.

---

## Task 3: Retention in ocr.scan (keep N days instead of immediate delete)

**Files:** Modify `packages/api/src/routers/ocr.ts`, `packages/api/src/routers/integration.test.ts`.

- [ ] **Step 1: Failing test** — replace the two existing auto-delete tests' env toggling with retention: add a test that with `process.env.RECEIPT_RETENTION_DAYS='30'` the scan **keeps** `storageKey` (starts `receipts/`, `deleteObject` NOT called), and a test that with `'0'` it deletes + clears (`deleteObject` called, `storageKey===''`). Reuse the in-memory/capturing store + `makeOcrFetch()` already in the file. Wrap env with a `try/finally` restore (pattern already used).
- [ ] **Step 2: Run → fail** (`-t "retention"`), Expected FAIL (current code uses `RECEIPT_AUTO_DELETE`).
- [ ] **Step 3: Implement** — in `ocr.ts scan`, replace:
```ts
        const autoDelete = process.env.RECEIPT_AUTO_DELETE !== 'false';
```
with:
```ts
        const retentionDays = Number.parseInt(process.env.RECEIPT_RETENTION_DAYS ?? '30', 10);
```
and change `if (autoDelete) {` to `if (retentionDays === 0) {`.
- [ ] **Step 4: Run → pass** — full `integration.test.ts` + `tsc --noEmit` clean.
- [ ] **Step 5: Commit** — `feat(api): keep receipt image for RECEIPT_RETENTION_DAYS (default 30)`.

---

## Task 4: Cleanup service + Receipt.createdAt index

**Files:** Create `packages/api/src/services/receipt-cleanup.ts`, `packages/api/src/services/receipt-cleanup.test.ts`. Modify `packages/db/prisma/schema.prisma` + new migration. Export the service from `index.ts`.

**Interface produced:** `cleanupExpiredReceipts(args: { prisma: PrismaClient; objectStore: ObjectStore; retentionDays: number; now: Date }): Promise<{ deleted: number }>`

- [ ] **Step 1: Failing integration test** — in `receipt-cleanup.test.ts` (needs DB): create two receipts with non-empty `storageKey` — one `createdAt` 40 days ago, one today (use `testPrisma.receipt.create` with explicit `createdAt`); put matching objects in a capturing in-memory store; run `cleanupExpiredReceipts({ ..., retentionDays: 30, now: new Date() })`; assert `deleted===1`, the old receipt's `storageKey===''` and its object deleted, the recent one untouched. Add a case where `deleteObject` throws for the expired row → the row's `storageKey` is still cleared and `deleted` still counts it (best-effort). (Import `testPrisma`/`resetDb` from the harness; this is a new test file — mirror `integration.test.ts`'s `beforeEach(resetDb)`.)
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** `receipt-cleanup.ts`:
```ts
/** Delete receipt images past the retention window (PRD §4.5, FR-5.8). */
import type { PrismaClient } from '@evenup/db';
import type { ObjectStore } from '../storage/object-store.js';

export async function cleanupExpiredReceipts(args: {
  prisma: PrismaClient;
  objectStore: ObjectStore;
  retentionDays: number;
  now: Date;
}): Promise<{ deleted: number }> {
  if (args.retentionDays <= 0) return { deleted: 0 };
  const cutoff = new Date(args.now.getTime() - args.retentionDays * 86_400_000);
  const expired = await args.prisma.receipt.findMany({
    where: { createdAt: { lt: cutoff }, NOT: { storageKey: '' } },
    select: { id: true, storageKey: true },
  });
  let deleted = 0;
  for (const r of expired) {
    try {
      await args.objectStore.deleteObject(r.storageKey);
    } catch {
      // best-effort: still clear the key so we don't retry forever
    }
    await args.prisma.receipt.update({ where: { id: r.id }, data: { storageKey: '' } });
    deleted++;
  }
  return { deleted };
}
```
- [ ] **Step 4: Migration** — add `@@index([createdAt])` to `model Receipt` in `schema.prisma`, then generate the migration SQL. Create `packages/db/prisma/migrations/2_receipt_created_at_idx/migration.sql` with `CREATE INDEX "Receipt_createdAt_idx" ON "Receipt"("createdAt");` and run `prisma migrate deploy` against the dev DB to confirm it applies. Run `prisma generate`.
- [ ] **Step 5: Run → pass** + `tsc --noEmit`. Export `cleanupExpiredReceipts` from `index.ts`.
- [ ] **Step 6: Commit** — `feat(api): expired-receipt cleanup service + Receipt.createdAt index`.

---

## Task 5: Cron cleanup route (web)

**Files:** Create `apps/web/src/app/api/cron/receipt-cleanup/route.ts`.

- [ ] **Step 1: Implement** the route:
```ts
import { prisma } from '@evenup/db';
import { cleanupExpiredReceipts } from '@evenup/api';
import { env } from '@/server/env';
import { getObjectStore } from '@/server/object-store';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request) {
  const secret = env.cronSecret;
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!secret || !timingSafeEqual(provided, secret)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { deleted } = await cleanupExpiredReceipts({
    prisma,
    objectStore: getObjectStore(),
    retentionDays: env.receiptRetentionDays,
    now: new Date(),
  });
  return Response.json({ deleted });
}
```
- [ ] **Step 2: Verify** — `pnpm turbo run typecheck --filter=@evenup/web` clean. (No unit test for the thin route; the service is tested in Task 4. Sanity: with `CRON_SECRET` unset the route returns 401.)
- [ ] **Step 3: Commit** — `feat(web): secret-guarded receipt-cleanup cron route`.

---

## Task 6: Receipt view route (session + group-access gated)

**Files:** Create `apps/web/src/app/api/receipts/[id]/route.ts`.

- [ ] **Step 1: Implement**:
```ts
import { prisma } from '@evenup/db';
import { auth } from '@/server/auth';
import { getObjectStore } from '@/server/object-store';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const receipt = await prisma.receipt.findUnique({
    where: { id },
    select: { storageKey: true, groupId: true },
  });
  if (!receipt || !receipt.storageKey) return new Response('Not found', { status: 404 });

  const group = await prisma.group.findUnique({
    where: { id: receipt.groupId },
    select: { createdById: true, members: { where: { userId: session.user.id }, select: { id: true } } },
  });
  const allowed = group && (group.createdById === session.user.id || group.members.length > 0);
  if (!allowed) return new Response('Forbidden', { status: 403 });

  const obj = await getObjectStore().getObject(receipt.storageKey);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(obj.bytes), {
    status: 200,
    headers: { 'Content-Type': obj.contentType, 'Cache-Control': 'private, max-age=300' },
  });
}
```
> Next 15 route params are async (`Promise<{id}>`) — matches the existing `[...all]`/`[trpc]` handlers. Confirm the group-membership check mirrors `assertGroupAccess` (creator or a member with `userId === session.user.id`).
- [ ] **Step 2: Verify** — `pnpm turbo run typecheck --filter=@evenup/web` clean.
- [ ] **Step 3: Commit** — `feat(web): session + group-gated receipt image view route`.

---

## Task 7: Surface "View receipt" + tests (API + E2E)

**Files:** Modify `packages/api/src/routers/transaction.ts` (`list`), `packages/api/src/routers/integration.test.ts`, `apps/web/src/components/group-detail.tsx`, `packages/i18n/src/locales/{cs,en}.ts`, `apps/web/e2e/critical-flow.spec.ts`.

- [ ] **Step 1: Failing API test** — assert `transaction.list` items include `hasReceiptImage`. In `integration.test.ts`: run the OCR scan (in-memory store, retention 30) to create a receipt with a `storageKey`, create an itemized expense with `receiptId` (mirror how the existing OCR E2E/flow links them — or set `receiptId` on `createExpense`), then `transaction.list` returns that tx with `hasReceiptImage===true`; a plain expense has `hasReceiptImage===false`.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement `list`** — extend `transactionInclude` with `receipt: { select: { id: true, storageKey: true } }` and map each returned tx to add `receiptId: tx.receipt?.id ?? null` and `hasReceiptImage: !!tx.receipt?.storageKey`. (Return the mapped shape; keep existing fields.)
- [ ] **Step 4: i18n** — add `'receipt.view'` to `cs.ts` (`'Zobrazit účtenku'`) and `en.ts` (`'View receipt'`).
- [ ] **Step 5: UI** — in `group-detail.tsx` Transactions list, for a tx where `hasReceiptImage`, render next to it: `<a href={\`/api/receipts/${tx.receiptId}\`} target="_blank" rel="noreferrer" className="text-xs text-brand-700 underline" data-testid="view-receipt">{t('receipt.view')}</a>`. Use the `Receipt`/`Camera` icon from `@/components/icons` if one exists; otherwise text only.
- [ ] **Step 6: Run API test → pass**; `typecheck` + `i18n` test pass.
- [ ] **Step 7: E2E** — extend the OCR test in `critical-flow.spec.ts`: after saving the itemized expense, assert `page.getByTestId('view-receipt')` is visible, then `const res = await page.request.get(new URL(await page.getByTestId('view-receipt').getAttribute('href')!, page.url()).toString()); expect(res.status()).toBe(200); expect(res.headers()['content-type']).toContain('image/');`. (The E2E web server uses the in-memory store via `AUTH_DEV_ECHO`, so the scanned image is retrievable.) Rebuild web before running: build cmd from prior plan, then `playwright test --project=chromium -g "OCR receipt"`.
- [ ] **Step 8: Commit** — `feat(web): show "View receipt" link on receipt-backed expenses (FR-5.8)`.

---

## Task 8: Whole-suite verification

- [ ] **Step 1** — with dev DB up + `DATABASE_URL` exported: `pnpm --filter @evenup/db exec prisma generate && pnpm format:check && pnpm turbo run lint typecheck test:coverage && pnpm --filter @evenup/web build && (cd apps/web && pnpm exec playwright test)`. All green; core coverage ≥95%.
- [ ] **Step 2** — `pnpm format` if needed; commit `chore: format`.

---

## Ops (controller-run after merge, not a subagent task)

1. Provision **MinIO** on Coolify (NetCup VPS), persistent volume, strong root creds, S3 API internal-only. Create bucket `evenup-receipts`, set 50 GiB hard quota (`mc quota set --size 50Gi --type hard`).
2. On the EvenUp app set: `STORAGE_ENDPOINT` (internal MinIO URL), `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET=evenup-receipts`, `STORAGE_REGION=us-east-1`, `RECEIPT_RETENTION_DAYS=30`, `CRON_SECRET=<random>`.
3. Add a Coolify **daily scheduled task** on the app: `node -e "fetch('http://127.0.0.1:3000/api/cron/receipt-cleanup',{method:'POST',headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>r.text()).then(console.log)"`.
4. Merge to `main`, push (auto-deploy), verify a real scan → "View receipt" → image loads on evenup.lnrtdev.cz.

## Self-review notes
- Spec coverage: getObject/in-memory → T1; resolver+env → T2; retention → T3; cleanup+index → T4; cron route → T5; view route → T6; surface+tests → T7; verify → T8; MinIO/cap/scheduled-task → Ops. All mapped.
- Type consistency: `getObject` signature identical in T1 (def) and T6 (use); `getObjectStore()` defined T2, used T5/T6; `cleanupExpiredReceipts` signature identical T4 (def) / T5 (use).
