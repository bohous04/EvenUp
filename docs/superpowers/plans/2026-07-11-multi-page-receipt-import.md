# Multi-page receipt import (screenshots + PDF) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the **web** app import one receipt that spans several screenshots or a PDF, feeding the existing OCR flow to produce a single itemized expense.

**Architecture:** All pages go to OpenRouter in **one** chat-completion call (multiple `image_url` parts, or a `file` part for PDF + the `file-parser` plugin); the model returns one reconciled receipt. `Receipt.storageKey` (single) becomes `storageKeys String[]`; VIP storage keeps every page; the serve route gains `?page=N`. The mobile app is untouched — the API stays backward-compatible with its single-`imageDataUrl` input.

**Tech Stack:** TypeScript, tRPC, zod, Prisma (Postgres), Next.js (App Router), React, Vitest, Playwright, OpenRouter (Gemini).

## Global Constraints

- **Web only.** Do NOT modify `apps/mobile/**`. The `ocr.scan` input MUST keep accepting the legacy `{ groupId, imageDataUrl }` shape so mobile keeps working.
- **Max 10 pages** per scan (`MAX_PAGES = 10`).
- **PDF engine** default `pdf-text`; overridable via env `OCR_PDF_ENGINE`.
- **Best-effort storage:** any object-store put/get/delete failure must never break OCR, expense creation, or the transaction list.
- **Icons, never emoji** — reuse `@/components/icons` in web UI.
- **Money is integer minor units** end-to-end; never change reconciliation math.
- Every task ends **green** (`pnpm -w typecheck` + the task's tests). Run API integration tests with a migrated throwaway Postgres via `DATABASE_URL` (see the `api-integration-tests-local` note); core/adapter/web-unit tests need no DB.
- Commit after each task. **Do NOT add a `Co-Authored-By` trailer.**

---

### Task 1: Storage model — one key → many (`storageKeys String[]`)

Pure refactor + data-preserving migration. Behavior is unchanged (still ≤1 key stored); it only widens the column and every reader to an array, so later tasks can store N pages.

**Files:**

- Modify: `packages/db/prisma/schema.prisma` (Receipt model, ~line 357)
- Create: `packages/db/prisma/migrations/<generated>_receipt_storage_keys/migration.sql`
- Modify: `packages/api/src/routers/ocr.ts:74-119`
- Modify: `packages/api/src/routers/transaction.ts:33,52-54`
- Modify: `packages/api/src/services/receipt-cleanup.ts:13-31`
- Modify: `apps/web/src/app/api/receipts/[id]/route.ts:17-31`
- Test: `packages/api/src/services/receipt-cleanup.test.ts`, `packages/api/src/routers/integration.test.ts` (update existing storage assertions)

**Interfaces:**

- Produces: `Receipt.storageKeys: string[]` (Prisma). `shapeTransaction` output gains `receiptPageCount: number` and keeps `hasReceiptImage: boolean`, `receiptId: string | null`.

- [ ] **Step 1: Change the schema**

In `packages/db/prisma/schema.prisma`, in `model Receipt`, replace:

```prisma
  storageKey              String
```

with:

```prisma
  storageKeys             String[]      @default([])
```

- [ ] **Step 2: Scaffold a create-only migration, then hand-write the SQL**

Run: `pnpm --filter @evenup/db exec prisma migrate dev --create-only --name receipt_storage_keys`

Then **replace** the generated `migration.sql` body with this data-preserving SQL (Prisma's default would drop data):

```sql
-- Widen single receipt image key to an array, preserving existing keys.
ALTER TABLE "Receipt" ADD COLUMN "storageKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "Receipt" SET "storageKeys" = ARRAY["storageKey"] WHERE "storageKey" <> '';
ALTER TABLE "Receipt" DROP COLUMN "storageKey";
```

- [ ] **Step 3: Apply the migration + regenerate the client**

Run: `pnpm --filter @evenup/db exec prisma migrate dev` then `pnpm --filter @evenup/db exec prisma generate`
Expected: migration applies; `Receipt.storageKeys` is typed `string[]`.

- [ ] **Step 4: Update the writer (`ocr.ts`) — no behavior change**

In `packages/api/src/routers/ocr.ts`, replace the storage block (lines ~74-91) and the two `receipt.create` calls so they use an array. Replace:

```ts
let storageKey = '';
const parsedRetentionDays = Number.parseInt(process.env.RECEIPT_RETENTION_DAYS ?? '30', 10);
const retentionDays = Number.isFinite(parsedRetentionDays) ? parsedRetentionDays : 30;
if (ctx.objectStore && user.isVip) {
  try {
    const { bytes, contentType, ext } = parseImageDataUrl(input.imageDataUrl);
    const key = `receipts/${input.groupId}/${crypto.randomUUID()}.${ext}`;
    await ctx.objectStore.putReceipt(key, bytes, contentType);
    storageKey = key;
    if (retentionDays === 0) {
      await ctx.objectStore.deleteObject(key);
      storageKey = '';
    }
  } catch (err) {
    console.warn('[ocr] receipt storage failed (best-effort)', err);
    storageKey = ''; // storage is best-effort
  }
}
```

with:

```ts
const storageKeys: string[] = [];
const parsedRetentionDays = Number.parseInt(process.env.RECEIPT_RETENTION_DAYS ?? '30', 10);
const retentionDays = Number.isFinite(parsedRetentionDays) ? parsedRetentionDays : 30;
if (ctx.objectStore && user.isVip) {
  try {
    const { bytes, contentType, ext } = parseImageDataUrl(input.imageDataUrl);
    const key = `receipts/${input.groupId}/${crypto.randomUUID()}.${ext}`;
    await ctx.objectStore.putReceipt(key, bytes, contentType);
    if (retentionDays === 0) {
      await ctx.objectStore.deleteObject(key); // retention 0: store nothing
    } else {
      storageKeys.push(key);
    }
  } catch (err) {
    console.warn('[ocr] receipt storage failed (best-effort)', err);
  }
}
```

In the success `receipt.create`, change `storageKey,` to `storageKeys,`. In the FAILED-path `receipt.create` (line ~115), change `storageKey: '',` to `storageKeys: [],`.

- [ ] **Step 5: Update the transaction shape**

In `packages/api/src/routers/transaction.ts`, change the include (line 33):

```ts
  receipt: { select: { id: true, storageKeys: true } },
```

and in `shapeTransaction` (lines 52-53) replace the receipt fields:

```ts
    receiptId: receipt?.id ?? null,
    hasReceiptImage: (receipt?.storageKeys.length ?? 0) > 0,
    receiptPageCount: receipt?.storageKeys.length ?? 0,
```

- [ ] **Step 6: Update cleanup to delete every key**

In `packages/api/src/services/receipt-cleanup.ts`, replace the query + loop:

```ts
const expired = await args.prisma.receipt.findMany({
  where: { createdAt: { lt: cutoff }, storageKeys: { isEmpty: false } },
  select: { id: true, storageKeys: true },
});
let deleted = 0;
for (const r of expired) {
  try {
    for (const key of r.storageKeys) {
      await args.objectStore.deleteObject(key);
    }
  } catch (err) {
    // Delete failed: do NOT clear storageKeys, so the next daily run retries.
    console.warn(`[receipt-cleanup] delete failed for ${r.id}, will retry`, err);
    continue;
  }
  await args.prisma.receipt.update({ where: { id: r.id }, data: { storageKeys: [] } });
  deleted++;
}
```

- [ ] **Step 7: Update the serve route (still serves page 0)**

In `apps/web/src/app/api/receipts/[id]/route.ts`, change the select (line 17) to `select: { storageKeys: true, groupId: true }`, the guard (line 19) to `if (!receipt || receipt.storageKeys.length === 0) return new Response('Not found', { status: 404 });`, and the fetch (line 31) to `const obj = await getObjectStore().getObject(receipt.storageKeys[0]!);`. Leave the content-type whitelist as-is (Task 4 adds paging + PDF).

- [ ] **Step 8: Update existing storage tests to the array shape**

In `packages/api/src/services/receipt-cleanup.test.ts`, change each `storageKey: 'receipts/x.png'` in `receipt.create` to `storageKeys: ['receipts/x.png']`, and each assertion `expect(after.storageKey).toBe('')` to `expect(after.storageKeys).toEqual([])`, and `.toBe('receipts/recent.png')` to `.toEqual(['receipts/recent.png'])`.

In `packages/api/src/routers/integration.test.ts`, in the retention tests change `expect(receipt.storageKey).toBe('')` to `expect(receipt.storageKeys).toEqual([])`, and `expect(receipt.storageKey).toMatch(/^receipts\//)` / `.toContain(...)` to assert on `receipt.storageKeys[0]!`.

- [ ] **Step 9: Run tests + typecheck**

Run: `pnpm -w typecheck && pnpm --filter @evenup/api test`
Expected: PASS (behavior identical, now array-backed).

- [ ] **Step 10: Commit**

```bash
git add packages/db packages/api apps/web/src/app/api/receipts
git commit -m "refactor(receipts): store receipt pages as storageKeys array"
```

---

### Task 2: Adapter — accept `pages[]`, PDF part, and the file-parser plugin

**Files:**

- Modify: `packages/api/src/ocr/openrouter-adapter.ts`
- Modify: `packages/api/src/routers/ocr.ts` (call site only)
- Test: `packages/api/src/ocr/openrouter-adapter.test.ts`

**Interfaces:**

- Consumes: `RECEIPT_JSON_SCHEMA`, `receiptSchema` (unchanged).
- Produces: `extractReceipt(args: { pages: string[]; apiKey; model?; baseUrl?; timeoutMs?; fetchImpl?; fallbackCurrency?; pdfEngine? }): Promise<OcrResult>`. `DEFAULT_PDF_ENGINE = 'pdf-text'`. `OcrResult` shape unchanged.

- [ ] **Step 1: Write failing adapter tests for multi-image + PDF**

In `packages/api/src/ocr/openrouter-adapter.test.ts`, change `baseArgs` to use `pages` and add the new cases:

```ts
const baseArgs = {
  pages: ['data:image/jpeg;base64,AAAA'],
  apiKey: 'sk-or-test',
  model: 'google/gemini-2.5-flash',
};

describe('extractReceipt — multi-page input', () => {
  test('sends one text part then one image_url part per page, no plugins', async () => {
    const fetchImpl = fakeFetch(HAPPY);
    await extractReceipt({
      ...baseArgs,
      pages: ['data:image/jpeg;base64,AAAA', 'data:image/png;base64,BBBB'],
      fetchImpl,
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    const content = body.messages[0].content;
    expect(content[0].type).toBe('text');
    expect(content.filter((c: { type: string }) => c.type === 'image_url')).toHaveLength(2);
    expect(body.plugins).toBeUndefined();
  });

  test('sends a PDF as a file part and enables the file-parser plugin', async () => {
    const fetchImpl = fakeFetch(HAPPY);
    await extractReceipt({
      ...baseArgs,
      pages: ['data:application/pdf;base64,JVBERi0='],
      fetchImpl,
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    const content = body.messages[0].content;
    expect(content.find((c: { type: string }) => c.type === 'file').file.file_data).toContain(
      'application/pdf',
    );
    expect(body.plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'pdf-text' } }]);
  });
});
```

Also update every existing call in that file that passes `imageDataUrl:` to pass `pages: [...]` instead (the `fixture(...)` currency tests and the robustness tests use `...baseArgs`, so they inherit `pages`; only inline `imageDataUrl` literals need changing — there are none besides `baseArgs`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @evenup/api test openrouter-adapter`
Expected: FAIL (type error on `pages`, and `plugins`/`file` parts missing).

- [ ] **Step 3: Implement the adapter changes**

In `packages/api/src/ocr/openrouter-adapter.ts`:

Add near the top constants: `export const DEFAULT_PDF_ENGINE = 'pdf-text';`

Append to `PROMPT`: `' The pages belong to ONE receipt (multiple screenshots or PDF pages) — combine them into a single receipt; do not duplicate items repeated in page headers/footers; the grand total appears once.'`

Replace `buildBody`:

```ts
const isPdf = (dataUrl: string) => dataUrl.startsWith('data:application/pdf');

function buildBody(pages: string[], model: string, pdfEngine: string) {
  const parts = pages.map((p) =>
    isPdf(p)
      ? { type: 'file', file: { filename: 'receipt.pdf', file_data: p } }
      : { type: 'image_url', image_url: { url: p } },
  );
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, ...parts] }],
    response_format: { type: 'json_schema', json_schema: RECEIPT_JSON_SCHEMA },
  };
  if (pages.some(isPdf)) {
    body.plugins = [{ id: 'file-parser', pdf: { engine: pdfEngine } }];
  }
  return body;
}
```

In `ExtractReceiptArgs`, replace `readonly imageDataUrl: string;` with `readonly pages: string[];` and add `readonly pdfEngine?: string;`.

In `callOnce`, change its args type from the `Pick<... 'imageDataUrl' ...>` to include `pages: string[]` and `pdfEngine: string` (drop `imageDataUrl`), and change the `fetchImpl(args.baseUrl, { ... body: JSON.stringify(buildBody(args.imageDataUrl, args.model)) ... })` to `JSON.stringify(buildBody(args.pages, args.model, args.pdfEngine))`.

In `extractReceipt`, change `resolved` to carry `pages: args.pages` (drop `imageDataUrl`) and add `pdfEngine: args.pdfEngine ?? DEFAULT_PDF_ENGINE`.

- [ ] **Step 4: Update the single call site to keep compiling**

In `packages/api/src/routers/ocr.ts`, in the `extractReceipt({ ... })` call, replace `imageDataUrl: input.imageDataUrl,` with `pages: [input.imageDataUrl],`. (Task 3 replaces this with the real multi-page list.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -w typecheck && pnpm --filter @evenup/api test openrouter-adapter`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/ocr packages/api/src/routers/ocr.ts
git commit -m "feat(ocr): adapter accepts multiple pages and native PDF input"
```

---

### Task 3: Router — `pages[]` input (backward-compatible), multi-page storage, `parseDataUrl`

**Files:**

- Modify: `packages/api/src/storage/object-store.ts` (rename + generalize `parseImageDataUrl`)
- Modify: `packages/api/src/storage/object-store.test.ts`
- Modify: `packages/api/src/routers/ocr.ts`
- Test: `packages/api/src/routers/integration.test.ts`

**Interfaces:**

- Consumes: `extractReceipt({ pages, ..., pdfEngine })` (Task 2).
- Produces: `parseDataUrl(dataUrl: string): { bytes: Buffer; contentType: string; ext: string }` (accepts `image/*` and `application/pdf`). `ocr.scan` input: `{ groupId, imageDataUrl }` **or** `{ groupId, pages: string[] }`.

- [ ] **Step 1: Write failing test for `parseDataUrl` (incl. PDF)**

In `packages/api/src/storage/object-store.test.ts`, change the import `parseImageDataUrl` → `parseDataUrl`, rename the `describe('parseImageDataUrl'…)` to `parseDataUrl`, update its calls, and add:

```ts
it('decodes an application/pdf data URL with a pdf ext', () => {
  const b64 = Buffer.from('%PDF-1.4').toString('base64');
  const { contentType, ext } = parseDataUrl(`data:application/pdf;base64,${b64}`);
  expect(contentType).toBe('application/pdf');
  expect(ext).toBe('pdf');
});
```

The existing negative case stays: `expect(() => parseDataUrl('data:text/plain;base64,aGk=')).toThrow();`

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @evenup/api test object-store`
Expected: FAIL (`parseDataUrl` not exported).

- [ ] **Step 3: Generalize the parser**

In `packages/api/src/storage/object-store.ts`, replace `parseImageDataUrl` with:

```ts
/** Parse a `data:image/...` or `data:application/pdf;base64,...` URL into bytes + content type + ext. */
export function parseDataUrl(dataUrl: string): { bytes: Buffer; contentType: string; ext: string } {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,(.+)$/s.exec(dataUrl);
  if (!m) throw new Error('Unsupported or malformed data URL');
  const contentType = m[1]!;
  const ext =
    contentType === 'application/pdf' ? 'pdf' : (contentType.split('/')[1]?.split('+')[0] ?? 'bin');
  return { bytes: Buffer.from(m[2]!, 'base64'), contentType, ext };
}
```

- [ ] **Step 4: Write failing integration tests for `pages[]`**

In `packages/api/src/routers/integration.test.ts`, inside the OCR describe, add (uses the existing `RECEIPT_PNG_BASE64` and `makeOcrFetch`):

```ts
test('scan accepts multiple pages and stores every page for a VIP', async () => {
  const puts: string[] = [];
  const store = {
    async putReceipt(key: string) {
      puts.push(key);
    },
    async deleteObject() {},
    async getObject() {
      return null;
    },
  };
  const olivia = await createTestUser('olivia@example.com');
  const caller = makeCaller(olivia, { ocrFetch: makeOcrFetch(), objectStore: store });
  const group = await caller.group.create({ name: 'M', baseCurrency: 'CZK' });
  await caller.user.setOpenRouterKey({ apiKey: 'sk-or-test-key' });
  await testPrisma.user.update({ where: { id: olivia.id }, data: { isVip: true } });

  const res = await caller.ocr.scan({
    groupId: group.id,
    pages: [
      `data:image/png;base64,${RECEIPT_PNG_BASE64}`,
      `data:image/png;base64,${RECEIPT_PNG_BASE64}`,
    ],
  });
  const receipt = await testPrisma.receipt.findUniqueOrThrow({ where: { id: res.receiptId } });
  expect(receipt.storageKeys).toHaveLength(2);
  expect(puts).toHaveLength(2);
});

test('scan rejects more than 10 pages', async () => {
  const olivia = await createTestUser('olivia@example.com');
  const caller = makeCaller(olivia, { ocrFetch: makeOcrFetch() });
  const group = await caller.group.create({ name: 'X', baseCurrency: 'CZK' });
  await caller.user.setOpenRouterKey({ apiKey: 'sk-or-test-key' });
  const pages = Array.from({ length: 11 }, () => 'data:image/png;base64,AAAA');
  await expect(caller.ocr.scan({ groupId: group.id, pages })).rejects.toThrow();
});

test('scan sends the file-parser plugin when a page is a PDF', async () => {
  const fetchImpl = makeOcrFetch();
  const olivia = await createTestUser('olivia@example.com');
  const caller = makeCaller(olivia, { ocrFetch: fetchImpl });
  const group = await caller.group.create({ name: 'P', baseCurrency: 'CZK' });
  await caller.user.setOpenRouterKey({ apiKey: 'sk-or-test-key' });
  await caller.ocr.scan({ groupId: group.id, pages: ['data:application/pdf;base64,JVBERi0='] });
  const body = JSON.parse(
    (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]![1]
      .body as string,
  );
  expect(body.plugins?.[0]?.id).toBe('file-parser');
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm --filter @evenup/api test integration`
Expected: FAIL (input has no `pages`; type error).

- [ ] **Step 6: Implement the router input union + multi-page storage**

In `packages/api/src/routers/ocr.ts`:

Change the import `parseImageDataUrl` → `parseDataUrl`. Add a const `const MAX_PAGES = 10;` above the router.

Replace the `.input(...)`:

```ts
    .input(
      z.union([
        z.object({
          groupId: z.string(),
          imageDataUrl: z.string().startsWith('data:image/'),
        }),
        z.object({
          groupId: z.string(),
          pages: z
            .array(z.string().regex(/^data:(image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,/))
            .min(1)
            .max(MAX_PAGES),
        }),
      ]),
    )
```

At the top of the mutation body, normalize:

```ts
const groupId = input.groupId;
const pages = 'pages' in input ? input.pages : [input.imageDataUrl];
```

Replace all remaining `input.groupId` with `groupId`. Change the `extractReceipt` call `pages: [input.imageDataUrl],` → `pages,` and add `pdfEngine: process.env.OCR_PDF_ENGINE || undefined,`.

Replace the storage block from Task 1 with a per-page loop:

```ts
const storageKeys: string[] = [];
const parsedRetentionDays = Number.parseInt(process.env.RECEIPT_RETENTION_DAYS ?? '30', 10);
const retentionDays = Number.isFinite(parsedRetentionDays) ? parsedRetentionDays : 30;
if (ctx.objectStore && user.isVip) {
  for (const page of pages) {
    try {
      const { bytes, contentType, ext } = parseDataUrl(page);
      const key = `receipts/${groupId}/${crypto.randomUUID()}.${ext}`;
      await ctx.objectStore.putReceipt(key, bytes, contentType);
      if (retentionDays === 0) {
        await ctx.objectStore.deleteObject(key);
      } else {
        storageKeys.push(key);
      }
    } catch (err) {
      console.warn('[ocr] receipt storage failed (best-effort)', err);
    }
  }
}
```

(The `receipt.create` calls already use `storageKeys` from Task 1.)

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm -w typecheck && pnpm --filter @evenup/api test`
Expected: PASS (legacy `imageDataUrl` tests + new `pages[]` tests).

- [ ] **Step 8: Commit**

```bash
git add packages/api
git commit -m "feat(ocr): accept pages[] input with multi-page storage, keep imageDataUrl compat"
```

---

### Task 4: Serve route — `?page=N` + PDF content type

**Files:**

- Create: `apps/web/src/lib/receipt-page.ts`
- Create: `apps/web/src/lib/receipt-page.test.ts`
- Modify: `apps/web/src/app/api/receipts/[id]/route.ts`

**Interfaces:**

- Produces: `resolveReceiptPage(pageCount: number, raw: string | null): number` — clamped index in `[0, pageCount-1]`.

- [ ] **Step 1: Write the failing helper test**

Create `apps/web/src/lib/receipt-page.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveReceiptPage } from './receipt-page';

describe('resolveReceiptPage', () => {
  it('defaults to 0 when the param is missing or invalid', () => {
    expect(resolveReceiptPage(3, null)).toBe(0);
    expect(resolveReceiptPage(3, 'abc')).toBe(0);
    expect(resolveReceiptPage(3, '-2')).toBe(0);
  });
  it('returns the requested page when in range', () => {
    expect(resolveReceiptPage(3, '1')).toBe(1);
  });
  it('clamps to the last page when out of range', () => {
    expect(resolveReceiptPage(3, '9')).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @evenup/web test receipt-page`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/lib/receipt-page.ts`:

```ts
/** Clamp a `?page=` query value to a valid index into a receipt's pages. */
export function resolveReceiptPage(pageCount: number, raw: string | null): number {
  const n = raw == null ? 0 : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, Math.max(0, pageCount - 1));
}
```

- [ ] **Step 4: Wire the route to page + PDF**

In `apps/web/src/app/api/receipts/[id]/route.ts`, import the helper: `import { resolveReceiptPage } from '@/lib/receipt-page';`

After the access check, replace the single-object fetch (`const obj = await getObjectStore().getObject(receipt.storageKeys[0]!);`) with:

```ts
const page = resolveReceiptPage(
  receipt.storageKeys.length,
  new URL(req.url).searchParams.get('page'),
);
const obj = await getObjectStore().getObject(receipt.storageKeys[page]!);
if (!obj) return new Response('Not found', { status: 404 });
```

Replace the content-type resolution so PDF is allowed inline (keep the raster whitelist + hardened headers):

```ts
// PDFs are served inline under the existing sandbox CSP + nosniff (see headers
// below); everything else must be a known-safe raster type or it's neutered to
// octet-stream (blocks stored XSS via SVG etc.). Conservative alternative for
// PDF: add `Content-Disposition: attachment` to force download instead.
let contentType: string;
if (obj.contentType === 'application/pdf') {
  contentType = 'application/pdf';
} else if (SAFE_IMAGE_TYPES.has(obj.contentType)) {
  contentType = obj.contentType;
} else {
  contentType = 'application/octet-stream';
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm -w typecheck && pnpm --filter @evenup/web test receipt-page`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/receipt-page.ts apps/web/src/lib/receipt-page.test.ts apps/web/src/app/api/receipts
git commit -m "feat(receipts): serve any page via ?page=N and allow PDF inline"
```

---

### Task 5: Web UI — multi-image + PDF picker with reorder/remove preview

**Files:**

- Create: `apps/web/src/lib/move-item.ts`
- Create: `apps/web/src/lib/move-item.test.ts`
- Modify: `apps/web/src/components/ocr-scan.tsx`
- Modify: `apps/web/src/components/group-detail.tsx:205-215`
- Modify: `packages/i18n/src/locales/cs.ts`, `packages/i18n/src/locales/en.ts`

**Interfaces:**

- Consumes: `trpc.ocr.scan` with `{ groupId, pages: string[] }`; `resolveReceiptPage`-backed route; `receiptPageCount` from `shapeTransaction`.
- Produces: `moveItem<T>(arr: T[], from: number, to: number): T[]`.

- [ ] **Step 1: Write the failing reorder-helper test**

Create `apps/web/src/lib/move-item.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { moveItem } from './move-item';

describe('moveItem', () => {
  it('moves an element up', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
  });
  it('moves an element down', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });
  it('clamps out-of-range targets and is a no-op for equal indices', () => {
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['b', 'a']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @evenup/web test move-item`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `moveItem`**

Create `apps/web/src/lib/move-item.ts`:

```ts
/** Return a new array with the element at `from` moved to the clamped `to` index. */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const clampedTo = Math.min(Math.max(to, 0), next.length - 1);
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return arr;
  next.splice(clampedTo, 0, moved);
  return next;
}
```

- [ ] **Step 4: Add i18n keys (cs + en)**

In `packages/i18n/src/locales/cs.ts` (after the `ocr.*` block) add:

```ts
  'ocr.addScreenshots': 'Přidat screenshoty',
  'ocr.importPdf': 'Importovat PDF',
  'ocr.pagesSelected': 'Vybrané stránky',
  'ocr.removePage': 'Odebrat stránku',
  'ocr.moveUp': 'Posunout nahoru',
  'ocr.moveDown': 'Posunout dolů',
  'ocr.scanPages': 'Rozpoznat účtenku',
  'ocr.pdfTooLarge': 'PDF je příliš velké (max 10 MB).',
  'ocr.tooManyPages': 'Maximálně 10 stránek.',
  'receipt.viewCount': 'Zobrazit účtenku ({count})',
```

In `packages/i18n/src/locales/en.ts` add the same keys:

```ts
  'ocr.addScreenshots': 'Add screenshots',
  'ocr.importPdf': 'Import PDF',
  'ocr.pagesSelected': 'Selected pages',
  'ocr.removePage': 'Remove page',
  'ocr.moveUp': 'Move up',
  'ocr.moveDown': 'Move down',
  'ocr.scanPages': 'Scan receipt',
  'ocr.pdfTooLarge': 'PDF is too large (max 10 MB).',
  'ocr.tooManyPages': 'At most 10 pages.',
  'receipt.viewCount': 'View receipt ({count})',
```

- [ ] **Step 5: Rework `ocr-scan.tsx` to collect a page list**

In `apps/web/src/components/ocr-scan.tsx`:

Add a page-preview type and state, keeping the existing `items`/save flow. Add above the component body’s return:

```tsx
type PagePreview = {
  id: string;
  kind: 'image' | 'pdf';
  label: string;
  preview?: string;
  dataUrl: string;
};
const [pages, setPages] = useState<PagePreview[]>([]);
const MAX_PAGES = 10;
const filesRef = useRef<HTMLInputElement>(null);
const pdfRef = useRef<HTMLInputElement>(null);

async function addImageFiles(files: FileList) {
  const room = MAX_PAGES - pages.length;
  if (room <= 0) {
    setError(t('ocr.tooManyPages'));
    return;
  }
  const picked = Array.from(files).slice(0, room);
  const next: PagePreview[] = [];
  for (const f of picked) {
    const dataUrl = await downscaleImage(f);
    next.push({ id: crypto.randomUUID(), kind: 'image', label: f.name, preview: dataUrl, dataUrl });
  }
  setPages((p) => [...p, ...next]);
  setError(null);
}

function addPdf(file: File) {
  if (pages.length >= MAX_PAGES) {
    setError(t('ocr.tooManyPages'));
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setError(t('ocr.pdfTooLarge'));
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result);
    setPages((p) => [...p, { id: crypto.randomUUID(), kind: 'pdf', label: file.name, dataUrl }]);
    setError(null);
  };
  reader.readAsDataURL(file);
}

function scanPages() {
  if (pages.length === 0) return;
  scan.mutate({ groupId, pages: pages.map((p) => p.dataUrl) });
}
```

Add two hidden inputs next to the existing camera/gallery inputs:

```tsx
      <input
        ref={filesRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid="ocr-files-input"
        onChange={(e) => { if (e.target.files?.length) void addImageFiles(e.target.files); }}
      />
      <input
        ref={pdfRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        data-testid="ocr-pdf-input"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) addPdf(f); }}
      />
```

In the `!items` branch (the upload buttons block), when `!lacksOcrAccess`, add buttons to trigger the new inputs (icons from `@/components/icons` — reuse `ImageIcon` and add a `FileText` import for PDF) and, when `pages.length > 0`, render the preview list with per-row remove + up/down using `moveItem`, plus a primary “scan” button:

```tsx
            <Button variant="secondary" onClick={() => filesRef.current?.click()} className="flex-1" data-testid="ocr-add-files-btn">
              <ImageIcon size={16} aria-hidden /> {t('ocr.addScreenshots')}
            </Button>
            <Button variant="secondary" onClick={() => pdfRef.current?.click()} className="flex-1" data-testid="ocr-add-pdf-btn">
              <FileText size={16} aria-hidden /> {t('ocr.importPdf')}
            </Button>
```

```tsx
{
  pages.length > 0 ? (
    <div className="mt-3 space-y-2" data-testid="ocr-pages">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('ocr.pagesSelected')}</p>
      {pages.map((p, i) => (
        <div
          key={p.id}
          className="flex items-center gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
          data-testid={`ocr-page-${i}`}
        >
          {p.preview ? (
            <img src={p.preview} alt="" className="h-10 w-10 rounded object-cover" />
          ) : (
            <FileText size={20} aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate text-sm">{p.label}</span>
          <button
            type="button"
            aria-label={t('ocr.moveUp')}
            disabled={i === 0}
            onClick={() => setPages((prev) => moveItem(prev, i, i - 1))}
          >
            <ChevronUp size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t('ocr.moveDown')}
            disabled={i === pages.length - 1}
            onClick={() => setPages((prev) => moveItem(prev, i, i + 1))}
          >
            <ChevronDown size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t('ocr.removePage')}
            data-testid={`ocr-page-remove-${i}`}
            onClick={() => setPages((prev) => prev.filter((_, j) => j !== i))}
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
      ))}
      <Button onClick={scanPages} disabled={scan.isPending} data-testid="ocr-scan-pages-btn">
        {scan.isPending ? t('ocr.processing') : t('ocr.scanPages')}
      </Button>
    </div>
  ) : null;
}
```

On `scan.onSuccess`, also clear pages: add `setPages([]);` next to `setItems(...)`. Import the icons you referenced: add `FileText, ChevronUp, ChevronDown` to the existing `@/components/icons` import, and `moveItem` from `@/lib/move-item`. Verify each icon exists in `@/components/icons`; if `FileText`/`ChevronUp`/`ChevronDown` are missing, add them there as small SVG components mirroring the existing icon style (never emoji).

- [ ] **Step 6: Show the page count on the transactions “view receipt” link**

In `apps/web/src/components/group-detail.tsx` (lines ~205-215), change the link content to reflect the count. Replace `{t('receipt.view')}` with:

```tsx
{
  (tx.receiptPageCount ?? 0) > 1
    ? t('receipt.viewCount', { count: tx.receiptPageCount })
    : t('receipt.view');
}
```

(Confirm the `t()` helper supports `{count}` interpolation as used elsewhere; if not, fall back to `` `${t('receipt.view')} (${tx.receiptPageCount})` ``.)

- [ ] **Step 7: Run unit tests + typecheck**

Run: `pnpm -w typecheck && pnpm --filter @evenup/web test && pnpm --filter @evenup/i18n test`
Expected: PASS (moveItem; i18n key-parity test if present). If `@evenup/i18n` has no `test` script, skip that segment.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src packages/i18n/src
git commit -m "feat(web): multi-screenshot + PDF receipt import with reorder preview"
```

---

### Task 6: Docs, env, and end-to-end verification

**Files:**

- Modify: `.env.example`
- Modify: `docs/SELF_HOSTING.md`
- Modify: `apps/web/e2e/critical-flow.spec.ts`

- [ ] **Step 1: Document the new env var**

In `.env.example`, near the other `OPENROUTER_*` / OCR entries, add:

```bash
# OCR PDF parsing engine used when a PDF is imported (OpenRouter file-parser plugin).
# `pdf-text` (default, free, good for digital receipts with a text layer) or `mistral-ocr` (paid, for scanned PDFs).
OCR_PDF_ENGINE=pdf-text
```

In `docs/SELF_HOSTING.md`, add a line documenting `OCR_PDF_ENGINE` (default `pdf-text`) in the OCR/OpenRouter section.

- [ ] **Step 2: Write a failing e2e for multi-image import**

In `apps/web/e2e/critical-flow.spec.ts`, add a test mirroring the existing OCR test but selecting **two** files on the multi-image input, then reordering and removing one before scanning:

```ts
test('multi-screenshot receipt import → itemized expense (mocked OpenRouter)', async ({
  page,
}, testInfo) => {
  // ... reuse the existing setup up to opening the OCR panel (expense-receipt-row) ...
  await page.getByTestId('ocr-files-input').setInputFiles([
    { name: 'p1.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') },
    { name: 'p2.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') },
  ]);
  await expect(page.getByTestId('ocr-page-0')).toBeVisible();
  await expect(page.getByTestId('ocr-page-1')).toBeVisible();
  await page.getByTestId('ocr-page-remove-1').click();
  await page.getByTestId('ocr-scan-pages-btn').click();
  await expect(page.getByTestId('ocr-items')).toBeVisible();
  await expect(page.getByTestId('ocr-item-name-0')).toHaveValue('Mléko');
});
```

(Reuse the same 1×1 PNG base64 constant the existing OCR test uses; keep the mocked `/api/dev/ocr-mock` receipt, which is fixed regardless of page count.)

- [ ] **Step 3: Run the e2e**

Run (see the `e2e-local-recipe` note for the Postgres + CI env vars): rebuild first because Playwright's `webServer` runs the production bundle — `pnpm --filter @evenup/web build`, then `pnpm --filter @evenup/web test:e2e -- --project=chromium critical-flow` (only chromium is installed locally).
Expected: PASS.

- [ ] **Step 4: Manual verification on the real app**

Use the `verify` skill / `/run`: on evenup.lnrt.cz (as a VIP), import (a) 3 real Albert screenshots and (b) a real receipt PDF; confirm each yields one itemized expense with a sensible total, and that “View receipt (N)” opens each stored page (and the PDF renders/downloads). Note the outcome; if OCR quality on PDFs is poor, try `OCR_PDF_ENGINE=mistral-ocr`.

- [ ] **Step 5: Commit**

```bash
git add .env.example docs/SELF_HOSTING.md apps/web/e2e/critical-flow.spec.ts
git commit -m "docs+test: OCR_PDF_ENGINE env and multi-image import e2e"
```

---

## Self-Review notes

- **Spec coverage:** §2 extraction → Task 2; §3 input union → Task 3; §4 VIP multi-page storage → Task 3 (+`parseDataUrl`); §5 serve route paging + PDF → Task 4; §6 schema/migration + transaction shape + cleanup → Task 1; §7 web UI → Task 5; §8 view-count link → Task 5; §9 tests → across Tasks 2-6; §10 env/docs → Task 6.
- **Ordering rationale:** the storage-column widening (Task 1) lands first so every reader compiles green before multi-page writes (Task 3) exist; the adapter (Task 2) is decoupled and only its single call site changes until Task 3 supplies the real page list.
- **Type consistency:** `storageKeys: string[]`, `parseDataUrl`, `extractReceipt({ pages, pdfEngine })`, `resolveReceiptPage`, `moveItem`, `receiptPageCount` are used with identical names across tasks.
