# EvenUp Web — Finish to PRD Phase 1+2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining strict PRD Phase 1+2 gaps in the EvenUp web app — receipt image storage, on-demand FX fetch, GDPR export/delete, a real filterable activity feed, OCR rate limiting — plus fix the local E2E env papercut and run an accessibility verification pass.

**Architecture:** Small, focused additions to an existing, green monorepo. Every external dependency (S3, FX provider, rate limiter) is injected through the tRPC **context** (the pattern already used for `prisma`, `secretBox`, `ocrFetch`) so unit/integration tests use in-memory fakes and **CI makes no live S3 / FX / OpenRouter calls**. No breaking schema changes; one optional index migration.

**Tech Stack:** TypeScript, pnpm + Turborepo, Next.js 15 (App Router), tRPC v11, Prisma + PostgreSQL, Vitest, Playwright + `@axe-core/playwright`, Better Auth, `@aws-sdk/client-s3`, Frankfurter FX API.

## Global Constraints

- **Money:** integer minor units only; never floating-point in split/settlement/FX math. Persist as `BigInt` via `fromMinor()` (`@evenup/db`); rates as `Prisma.Decimal`.
- **No live external calls in CI:** S3, FX, and OpenRouter are always injectable; tests pass fakes. FX auto-fetch runs **only when `ctx.fxFetch` is provided** (web sets it to global `fetch`; tests set a fake) — never fall through to `globalThis.fetch` implicitly.
- **i18n (FR-10.4):** every user-facing string is a `MessageKey` present in BOTH `packages/i18n/src/locales/cs.ts` and `en.ts`. `en.ts` is typed `Messages` (derived from `cs.ts`), so a missing/extra key is a compile error. Czech is the default.
- **Validation & access:** every procedure uses a zod input schema; group-scoped procedures call `assertGroupAccess` (or `assertGroupAdmin`).
- **Secrets:** IBANs and BYO keys stay encrypted at rest; never log or return ciphertext or storage internals to clients.
- **Coverage:** keep `packages/core` ≥ 95%; cover all new `api` code. CI runs `pnpm turbo run test:coverage`.
- **ESM:** intra-package imports use explicit `.js` extensions (e.g. `import { x } from './y.js'`), matching the codebase.
- **Commits:** conventional commits; do **not** add any `Co-Authored-By` trailer.
- **Local test DB:** api/e2e need a migrated Postgres. Bring one up with:
  ```bash
  docker run -d --name evenup-dev-db -e POSTGRES_USER=evenup -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=evenup -p 55432:5432 postgres:16-alpine
  export DATABASE_URL="postgresql://evenup:pass@localhost:55432/evenup"
  pnpm --filter @evenup/db exec prisma migrate deploy
  ```

---

## Task 1: Fix local E2E env papercut + scrub committed Resend key

Local `next start` auto-loads `apps/web/.env.local`, whose live `RESEND_API_KEY` makes the Playwright server try (and fail) to email magic links to fake test addresses, so every E2E fails at sign-in. Force the dev/console mail path in the E2E server, and remove the real secret from disk.

**Files:**

- Modify: `apps/web/playwright.config.ts:31-41` (the `webServer.env` block)
- Modify: `apps/web/.env.local` (replace the real key with a placeholder)

**Interfaces:**

- Produces: a green local E2E run — every later task's E2E step depends on this.

- [ ] **Step 1: Confirm the failure first**

Bring up the dev DB (see Global Constraints), then:

```bash
cd apps/web && DATABASE_URL="postgresql://evenup:pass@localhost:55432/evenup" pnpm exec playwright test --project=chromium -g "language switch"
```

Expected: FAIL — `getByTestId('magic-sent')` never appears (sign-in helper times out).

- [ ] **Step 2: Force the dev mail path in the E2E web server**

In `apps/web/playwright.config.ts`, add two keys to the existing `webServer.env` object (right after `AUTH_DEV_ECHO: 'true',`):

```ts
      AUTH_DEV_ECHO: 'true',
      // Force the console/dev-echo mail path regardless of a developer's
      // .env.local (which next start auto-loads) so local E2E signs in without
      // a real mail transport.
      RESEND_API_KEY: '',
      SMTP_HOST: '',
```

- [ ] **Step 3: Verify the same test now passes**

```bash
cd apps/web && DATABASE_URL="postgresql://evenup:pass@localhost:55432/evenup" pnpm exec playwright test --project=chromium -g "language switch"
```

Expected: PASS.

- [ ] **Step 4: Scrub the real Resend key from `.env.local`**

Replace the `RESEND_API_KEY=re_...` line in `apps/web/.env.local` with:

```
RESEND_API_KEY=
```

(The file is gitignored; this just removes a live secret from disk. Note in the PR description that the key should be rotated in the Resend dashboard.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/playwright.config.ts
git commit -m "test(web): force dev mail path in E2E web server so local runs pass"
```

---

## Task 2: ObjectStore module (S3/MinIO wrapper + data-URL parser)

A thin, injectable object-storage abstraction with an S3 implementation (MinIO-compatible), a no-op implementation for bare self-hosts, and a pure data-URL parser (unit-tested).

**Files:**

- Create: `packages/api/src/storage/object-store.ts`
- Create: `packages/api/src/storage/object-store.test.ts`
- Modify: `packages/api/package.json` (add `@aws-sdk/client-s3`)

**Interfaces:**

- Produces:
  - `interface ObjectStore { putReceipt(key: string, bytes: Uint8Array, contentType: string): Promise<void>; deleteObject(key: string): Promise<void>; }`
  - `createS3ObjectStore(cfg: S3Config): ObjectStore`
  - `createNoopObjectStore(): ObjectStore`
  - `parseImageDataUrl(dataUrl: string): { bytes: Buffer; contentType: string; ext: string }`

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @evenup/api add @aws-sdk/client-s3
```

Expected: `@aws-sdk/client-s3` appears under `dependencies` in `packages/api/package.json`.

- [ ] **Step 2: Write the failing test for the data-URL parser**

Create `packages/api/src/storage/object-store.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseImageDataUrl, createNoopObjectStore } from './object-store.js';

describe('parseImageDataUrl', () => {
  it('decodes a base64 png data URL to bytes + content type + ext', () => {
    // 1x1 transparent PNG
    const b64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
    const { bytes, contentType, ext } = parseImageDataUrl(`data:image/png;base64,${b64}`);
    expect(contentType).toBe('image/png');
    expect(ext).toBe('png');
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.equals(Buffer.from(b64, 'base64'))).toBe(true);
  });

  it('throws on a non-image / malformed data URL', () => {
    expect(() => parseImageDataUrl('data:text/plain;base64,aGk=')).toThrow();
    expect(() => parseImageDataUrl('not-a-data-url')).toThrow();
  });
});

describe('createNoopObjectStore', () => {
  it('resolves without doing anything', async () => {
    const store = createNoopObjectStore();
    await expect(store.putReceipt('k', new Uint8Array([1]), 'image/png')).resolves.toBeUndefined();
    await expect(store.deleteObject('k')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @evenup/api exec vitest run src/storage/object-store.test.ts
```

Expected: FAIL — cannot resolve `./object-store.js`.

- [ ] **Step 4: Implement the module**

Create `packages/api/src/storage/object-store.ts`:

```ts
/**
 * Injectable object storage for receipt images (PRD §4.5, FR-5.8). The S3
 * implementation is MinIO-compatible (path-style). A no-op implementation lets
 * OCR work on a self-host with no storage configured. Tests use an in-memory
 * fake, so CI makes no live S3 calls.
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export interface ObjectStore {
  putReceipt(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
}

export interface S3Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function createS3ObjectStore(cfg: S3Config): ObjectStore {
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: true, // MinIO
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return {
    async putReceipt(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
        }),
      );
    },
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    },
  };
}

export function createNoopObjectStore(): ObjectStore {
  return {
    async putReceipt() {},
    async deleteObject() {},
  };
}

/** Parse a `data:image/...;base64,...` URL into raw bytes + content type + extension. */
export function parseImageDataUrl(dataUrl: string): {
  bytes: Buffer;
  contentType: string;
  ext: string;
} {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) throw new Error('Unsupported or malformed image data URL');
  const contentType = m[1];
  const ext = contentType.split('/')[1]?.split('+')[0] ?? 'bin';
  return { bytes: Buffer.from(m[2], 'base64'), contentType, ext };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @evenup/api exec vitest run src/storage/object-store.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/storage/object-store.ts packages/api/src/storage/object-store.test.ts packages/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add injectable ObjectStore (S3/MinIO) + data-URL parser"
```

---

## Task 3: Wire ObjectStore + FX fetch + OCR rate limiter into the context

Extend the tRPC context with the three new injectable dependencies at once (they share the same wiring points), and construct concrete implementations in the web tRPC context from env. This is a single reviewable unit: the context contract plus its one production wiring.

**Files:**

- Modify: `packages/api/src/context.ts`
- Modify: `packages/api/src/index.ts` (export new types)
- Modify: `apps/web/src/server/env.ts`
- Modify: `apps/web/src/server/trpc.ts`
- Modify: `.env.example`, `docs/SELF_HOSTING.md`

**Interfaces:**

- Consumes: `ObjectStore` (Task 2), `FetchLike` (`packages/api/src/ocr/openrouter-adapter.ts`).
- Produces: `Context.objectStore?: ObjectStore`, `Context.fxFetch?: FetchLike`, `Context.ocrRateLimit?: RateLimiter`; `CreateContextOptions` mirrors them. (`RateLimiter` is fully defined in Task 11; here it is referenced as an optional structural type `{ check(key: string): boolean }` to avoid an import cycle — declare it inline in `context.ts`.)

- [ ] **Step 1: Extend the context type + factory**

In `packages/api/src/context.ts`, add the import and fields. Add after the existing `FetchLike` import:

```ts
import type { ObjectStore } from './storage/object-store.js';

/** Minimal rate-limiter shape (implemented in packages/api/src/rate-limit.ts). */
export interface RateLimiter {
  check(key: string): boolean;
}
```

Add to `interface Context` (after `ocrFetch`):

```ts
  /** Injectable object storage for receipt images (no-op/fake in tests). */
  readonly objectStore?: ObjectStore;
  /** Injectable fetch for the FX provider (fake in tests; unset disables auto-fetch). */
  readonly fxFetch?: FetchLike;
  /** Per-user rate limiter for OCR (fake in tests; unset disables limiting). */
  readonly ocrRateLimit?: RateLimiter;
```

Add the same three (optional) to `interface CreateContextOptions`, and pass them through in `createContext`:

```ts
    ocrFetch: opts.ocrFetch,
    objectStore: opts.objectStore,
    fxFetch: opts.fxFetch,
    ocrRateLimit: opts.ocrRateLimit,
```

- [ ] **Step 2: Export the new type from the api barrel**

In `packages/api/src/index.ts`, add to the `context.js` re-export block:

```ts
export {
  createContext,
  type Context,
  type CreateContextOptions,
  type AuthUser,
  type RateLimiter,
} from './context.js';
export {
  createS3ObjectStore,
  createNoopObjectStore,
  parseImageDataUrl,
  type ObjectStore,
  type S3Config,
} from './storage/object-store.js';
```

- [ ] **Step 3: Add env accessors for storage + auto-delete + FX provider**

In `apps/web/src/server/env.ts`, add to the exported `env` object (after the `email` block):

```ts
  storage: {
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? 'us-east-1',
    accessKey: process.env.STORAGE_ACCESS_KEY,
    secretKey: process.env.STORAGE_SECRET_KEY,
    bucket: process.env.STORAGE_BUCKET ?? 'evenup-receipts',
  },
  // Delete the receipt image after a successful OCR extraction (privacy). Default on.
  receiptAutoDelete: process.env.RECEIPT_AUTO_DELETE !== 'false',
  fxProviderUrl: process.env.FX_PROVIDER_URL ?? 'https://api.frankfurter.app',
```

- [ ] **Step 4: Construct the dependencies in the web tRPC context**

Replace the body of `apps/web/src/server/trpc.ts` with (the `ocrRateLimit` wiring is added later, in Task 11 — leave it out here):

```ts
/** Build the tRPC context for a request from the Better Auth session. */
import 'server-only';
import { prisma } from '@evenup/db';
import {
  createContext,
  createS3ObjectStore,
  createNoopObjectStore,
  type Context,
  type ObjectStore,
} from '@evenup/api';
import { createSecretBox } from '@evenup/api';
import { auth } from './auth.js';
import { env } from './env.js';

const secretBox = createSecretBox(env.encryptionKey);

const objectStore: ObjectStore =
  env.storage.endpoint && env.storage.accessKey && env.storage.secretKey
    ? createS3ObjectStore({
        endpoint: env.storage.endpoint,
        region: env.storage.region,
        accessKeyId: env.storage.accessKey,
        secretAccessKey: env.storage.secretKey,
        bucket: env.storage.bucket,
      })
    : createNoopObjectStore();

export async function createTrpcContext(headers: Headers): Promise<Context> {
  const session = await auth.api.getSession({ headers });
  return createContext({
    prisma,
    secretBox,
    user: session?.user ? { id: session.user.id, email: session.user.email } : null,
    objectStore,
    fxFetch: fetch, // global fetch enables on-demand FX; tests inject a fake
  });
}
```

> `ocrRateLimit` is intentionally not wired here — Task 11 adds the `./rate-limit.js` singleton, its import, and the `ocrRateLimit` field. The app compiles fine without it (the field is optional).

- [ ] **Step 5: Document the new env vars**

In `.env.example`, under the storage block, add:

```
# Delete the receipt image after successful OCR extraction (privacy). Default true.
RECEIPT_AUTO_DELETE=true
```

In `docs/SELF_HOSTING.md`, add a one-line row noting `RECEIPT_AUTO_DELETE` (default `true`) controls receipt-image retention.

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @evenup/db exec prisma generate >/dev/null && pnpm turbo run typecheck --filter=@evenup/api --filter=@evenup/web
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/context.ts packages/api/src/index.ts apps/web/src/server/env.ts apps/web/src/server/trpc.ts .env.example docs/SELF_HOSTING.md
git commit -m "feat(api): inject objectStore, fxFetch, ocrRateLimit through context"
```

---

## Task 4: OCR scan uploads the receipt image, then auto-deletes it

Wire storage into the `ocr.scan` mutation: upload the decoded image to the object store, persist the `storageKey`, and (when `RECEIPT_AUTO_DELETE` is on) delete the object and clear the key after a successful extraction. Storage is **best-effort** — a failure is swallowed and never blocks OCR.

**Files:**

- Modify: `packages/api/src/routers/ocr.ts`
- Modify: `packages/api/src/routers/integration.test.ts` (add a test) or create `packages/api/src/routers/ocr.test.ts`
- Modify: `packages/api/src/test/harness.ts` (let `makeCaller` accept `objectStore`)

**Interfaces:**

- Consumes: `ObjectStore`, `parseImageDataUrl` (Task 2); `ctx.objectStore` (Task 3).
- Produces: receipts now persist a non-empty `storageKey` when auto-delete is off.

- [ ] **Step 1: Let the test harness inject an object store**

In `packages/api/src/test/harness.ts`, extend the `makeCaller` options to carry all three injectables used by later tasks (objectStore now, fxFetch in Task 6, ocrRateLimit in Task 11):

```ts
import type { ObjectStore } from '../storage/object-store.js';
import type { RateLimiter } from '../context.js';
// ...
export function makeCaller(
  user: AuthUser | null,
  opts: {
    ocrFetch?: FetchLike;
    objectStore?: ObjectStore;
    fxFetch?: FetchLike;
    ocrRateLimit?: RateLimiter;
  } = {},
): Caller {
  return callerFactory(
    createContext({
      prisma: testPrisma,
      user,
      secretBox: testSecretBox,
      ocrFetch: opts.ocrFetch,
      objectStore: opts.objectStore,
      fxFetch: opts.fxFetch,
      ocrRateLimit: opts.ocrRateLimit,
    }),
  );
}
```

- [ ] **Step 2: Write the failing test**

Add to `packages/api/src/routers/integration.test.ts` a test that captures uploads with an in-memory fake store. Use the existing OCR fixture/fetch pattern already in that file (search for the existing `ocr` test to reuse its `ocrFetch` fake and group/user setup). Add:

```ts
it('uploads the receipt image and auto-deletes it after extraction (FR-5.8)', async () => {
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
  const user = await createTestUser();
  const caller = makeCaller(user, { ocrFetch: makeOcrFetch(), objectStore: store });
  const group = await caller.group.create({ name: 'R', baseCurrency: 'CZK' });

  process.env.RECEIPT_AUTO_DELETE = 'true';
  const res = await caller.ocr.scan({
    groupId: group.id,
    imageDataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  });

  expect(puts).toHaveLength(1);
  expect(puts[0].key).toContain(`receipts/${group.id}/`);
  expect(deletes).toEqual([puts[0].key]); // auto-deleted
  const receipt = await testPrisma.receipt.findUniqueOrThrow({ where: { id: res.receiptId } });
  expect(receipt.storageKey).toBe(''); // cleared after auto-delete
});
```

> `makeOcrFetch()` is the existing helper/fixture the current OCR test uses to fake OpenRouter (returns the two-item receipt). Reuse it verbatim — do not add a new fixture. If the current test builds the fake inline, extract it to a small local helper in the test file first.

- [ ] **Step 3: Run the test to verify it fails**

```bash
DATABASE_URL="postgresql://evenup:pass@localhost:55432/evenup" pnpm --filter @evenup/api exec vitest run src/routers/integration.test.ts -t "uploads the receipt image"
```

Expected: FAIL — `puts` is empty (upload not wired) and `storageKey` is `''` for the wrong reason.

- [ ] **Step 4: Implement upload + auto-delete in `ocr.scan`**

In `packages/api/src/routers/ocr.ts`, add the import:

```ts
import { parseImageDataUrl } from '../storage/object-store.js';
```

Replace the success-path `receipt` creation (the block that currently sets `storageKey: ''`) with an upload-first flow:

```ts
      // Best-effort image storage (FR-5.8): a storage failure must never block OCR.
      let storageKey = '';
      const autoDelete = process.env.RECEIPT_AUTO_DELETE !== 'false';
      try {
        const result = await extractReceipt({
          imageDataUrl: input.imageDataUrl,
          apiKey,
          model,
          baseUrl: process.env.OPENROUTER_BASE_URL || undefined,
          fallbackCurrency: group.baseCurrency,
          fetchImpl: ctx.ocrFetch,
        });

        if (ctx.objectStore) {
          try {
            const { bytes, contentType, ext } = parseImageDataUrl(input.imageDataUrl);
            const key = `receipts/${input.groupId}/${crypto.randomUUID()}.${ext}`;
            await ctx.objectStore.putReceipt(key, bytes, contentType);
            storageKey = key;
            if (autoDelete) {
              await ctx.objectStore.deleteObject(key);
              storageKey = '';
            }
          } catch {
            storageKey = ''; // storage is best-effort
          }
        }

        const receipt = await ctx.prisma.receipt.create({
          data: {
            groupId: input.groupId,
            storageKey,
            ocrModel: model,
            status: 'COMPLETED',
            rawJson: result as unknown as object,
            merchant: result.merchant,
            detectedCurrency: result.currency,
            detectedTotalMinorUnits: fromMinor(result.totalMinorUnits),
            confidence: result.confidence,
          },
        });
        return { receiptId: receipt.id, result };
      } catch (err) {
        // ...existing FAILED-receipt + TRPCError fallback stays unchanged...
```

> Keep the existing `catch` block (the `status: 'FAILED'` receipt + `UNPROCESSABLE_CONTENT`/`OcrError` handling) exactly as-is. `crypto` is the global Web Crypto (`globalThis.crypto`) available in Node 20+ and Next server — no import needed.

- [ ] **Step 5: Run tests to verify they pass**

```bash
DATABASE_URL="postgresql://evenup:pass@localhost:55432/evenup" pnpm --filter @evenup/api exec vitest run src/routers/integration.test.ts
```

Expected: PASS (existing tests + the new one).

- [ ] **Step 6: Add the auto-delete-off case, run, commit**

Add a second test asserting that with `process.env.RECEIPT_AUTO_DELETE = 'false'`, `deletes` is empty and `receipt.storageKey` starts with `receipts/`. Run the file again (Expected: PASS), then:

```bash
git add packages/api/src/routers/ocr.ts packages/api/src/routers/integration.test.ts packages/api/src/test/harness.ts
git commit -m "feat(api): store receipt image in object storage with auto-delete (FR-5.8)"
```

---

## Task 5: FX provider module (Frankfurter fetch)

A pure, injectable function that fetches a day's rate from Frankfurter and returns it as a decimal string, or `null` on any error/timeout (never throws).

**Files:**

- Create: `packages/api/src/services/fx-provider.ts`
- Create: `packages/api/src/services/fx-provider.test.ts`

**Interfaces:**

- Consumes: `FetchLike` (`../ocr/openrouter-adapter.js`).
- Produces: `fetchRate(args: FetchRateArgs): Promise<{ rateDecimal: string; source: string } | null>` where `FetchRateArgs = { baseCurrency: string; quoteCurrency: string; date: Date; providerUrl: string; fetchImpl: FetchLike; timeoutMs?: number }`. Semantics: returns the multiplier for `quote → base` (i.e. `baseAmount = quoteAmount × rate`).

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/services/fx-provider.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fetchRate } from './fx-provider.js';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

describe('fetchRate (Frankfurter)', () => {
  it('requests from=quote&to=base for the day and returns the rate', async () => {
    let calledUrl = '';
    const rate = await fetchRate({
      baseCurrency: 'CZK',
      quoteCurrency: 'EUR',
      date: new Date('2026-06-22T10:00:00Z'),
      providerUrl: 'https://api.frankfurter.app',
      fetchImpl: async (url) => {
        calledUrl = url;
        return jsonResponse({ base: 'EUR', date: '2026-06-22', rates: { CZK: 24.7 } });
      },
    });
    expect(calledUrl).toBe('https://api.frankfurter.app/2026-06-22?from=EUR&to=CZK');
    expect(rate).toEqual({ rateDecimal: '24.7', source: 'frankfurter' });
  });

  it('returns null on a non-ok response', async () => {
    const rate = await fetchRate({
      baseCurrency: 'CZK',
      quoteCurrency: 'EUR',
      date: new Date('2026-06-22'),
      providerUrl: 'https://api.frankfurter.app',
      fetchImpl: async () => jsonResponse({}, false),
    });
    expect(rate).toBeNull();
  });

  it('returns null when the fetch throws', async () => {
    const rate = await fetchRate({
      baseCurrency: 'CZK',
      quoteCurrency: 'EUR',
      date: new Date('2026-06-22'),
      providerUrl: 'https://api.frankfurter.app',
      fetchImpl: async () => {
        throw new Error('network');
      },
    });
    expect(rate).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @evenup/api exec vitest run src/services/fx-provider.test.ts
```

Expected: FAIL — cannot resolve `./fx-provider.js`.

- [ ] **Step 3: Implement the module**

Create `packages/api/src/services/fx-provider.ts`:

```ts
/**
 * FX provider fetch (PRD §4.8, FR-8.2). Frankfurter returns the multiplier
 * `from -> to`; with from=quote, to=base this is `base = quote * rate`, matching
 * @evenup/core `convert`. Returns null on any error/timeout (never throws) so the
 * caller can fall back to a cached rate or manual entry. Injectable fetch =>
 * no live calls in CI.
 */
import type { FetchLike } from '../ocr/openrouter-adapter.js';

export interface FetchRateArgs {
  readonly baseCurrency: string;
  readonly quoteCurrency: string;
  readonly date: Date;
  readonly providerUrl: string;
  readonly fetchImpl: FetchLike;
  readonly timeoutMs?: number;
}

export async function fetchRate(
  args: FetchRateArgs,
): Promise<{ rateDecimal: string; source: string } | null> {
  const day = args.date.toISOString().slice(0, 10);
  const base = args.providerUrl.replace(/\/$/, '');
  const url = `${base}/${day}?from=${args.quoteCurrency}&to=${args.baseCurrency}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 10_000);
  try {
    const res = await args.fetchImpl(url, { method: 'GET', signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number> };
    const rate = json.rates?.[args.baseCurrency];
    if (typeof rate !== 'number' || !(rate > 0)) return null;
    return { rateDecimal: String(rate), source: 'frankfurter' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @evenup/api exec vitest run src/services/fx-provider.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/fx-provider.ts packages/api/src/services/fx-provider.test.ts
git commit -m "feat(api): add Frankfurter FX provider fetch (FR-8.2)"
```

---

## Task 6: FX resolution fetches + caches on demand, with stale fallback

Extend `resolveRateDecimal` so that, when no cached/locked/override rate exists AND a fetch impl is provided, it fetches from the provider, caches the row, and returns it; if the provider fails it returns the newest cached row flagged `stale`. Guarded on an explicit fetch impl so tests without one keep the old throw-on-missing behavior (no live calls in CI).

**Files:**

- Modify: `packages/api/src/services/fx-service.ts`
- Modify: `packages/api/src/routers/transaction.ts` (pass the fetch impl)
- Modify: `packages/api/src/routers/integration.test.ts` (tests)

**Interfaces:**

- Consumes: `fetchRate` (Task 5); `ctx.fxFetch` (Task 3).
- Produces: `resolveRateDecimal(prisma, fromCurrency, baseCurrency, date, override?, lockedRate?, fetch?)` returning `{ rateDecimal: string; overridden: boolean; source: string; stale: boolean }`, where `fetch?: { fetchImpl: FetchLike; providerUrl: string }`.

- [ ] **Step 1: Write failing tests**

Add to `packages/api/src/routers/integration.test.ts` (using the `fxFetch` option added to `makeCaller` in Task 4). Each `fxFetch` is a typed fake — `FetchLike = (input: string, init: RequestInit) => Promise<Response>`:

```ts
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
```

> Add `import { Prisma } from '@evenup/db';` to the test file if it isn't already imported.

- [ ] **Step 2: Run tests to verify they fail**

```bash
DATABASE_URL="postgresql://evenup:pass@localhost:55432/evenup" pnpm --filter @evenup/api exec vitest run src/routers/integration.test.ts -t "auto-fetches"
```

Expected: FAIL — no rate cached/fetched → `resolveRateDecimal` throws "provide one manually".

- [ ] **Step 3: Extend `resolveRateDecimal`**

Rewrite `packages/api/src/services/fx-service.ts`'s `resolveRateDecimal` (keep `convertToBase` unchanged). Add imports at the top:

```ts
import { Prisma } from '@evenup/db';
import type { FetchLike } from '../ocr/openrouter-adapter.js';
import { fetchRate } from './fx-provider.js';
```

Replace the function with:

```ts
export interface ResolveRateFetch {
  readonly fetchImpl: FetchLike;
  readonly providerUrl: string;
}

export interface ResolvedRateInfo {
  readonly rateDecimal: string;
  readonly overridden: boolean;
  readonly source: string;
  readonly stale: boolean;
}

export async function resolveRateDecimal(
  prisma: PrismaClient,
  fromCurrency: string,
  baseCurrency: string,
  date: Date,
  override?: string,
  lockedRate?: Prisma.Decimal | null,
  fetch?: ResolveRateFetch,
): Promise<ResolvedRateInfo> {
  if (fromCurrency === baseCurrency) {
    return { rateDecimal: '1', overridden: false, source: 'identity', stale: false };
  }
  if (override) {
    return { rateDecimal: override, overridden: true, source: 'override', stale: false };
  }
  if (lockedRate) {
    return {
      rateDecimal: lockedRate.toString(),
      overridden: false,
      source: 'locked',
      stale: false,
    };
  }
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const row = await prisma.fxRate.findUnique({
    where: { base_quote_date: { base: baseCurrency, quote: fromCurrency, date: day } },
  });
  if (row) {
    return {
      rateDecimal: row.rate.toString(),
      overridden: false,
      source: row.source,
      stale: false,
    };
  }
  if (fetch?.fetchImpl) {
    const fetched = await fetchRate({
      baseCurrency,
      quoteCurrency: fromCurrency,
      date: day,
      providerUrl: fetch.providerUrl,
      fetchImpl: fetch.fetchImpl,
    });
    if (fetched) {
      await prisma.fxRate.upsert({
        where: { base_quote_date: { base: baseCurrency, quote: fromCurrency, date: day } },
        create: {
          base: baseCurrency,
          quote: fromCurrency,
          rate: new Prisma.Decimal(fetched.rateDecimal),
          date: day,
          source: fetched.source,
        },
        update: { rate: new Prisma.Decimal(fetched.rateDecimal), source: fetched.source },
      });
      return {
        rateDecimal: fetched.rateDecimal,
        overridden: false,
        source: fetched.source,
        stale: false,
      };
    }
    const latest = await prisma.fxRate.findFirst({
      where: { base: baseCurrency, quote: fromCurrency },
      orderBy: { date: 'desc' },
    });
    if (latest) {
      return {
        rateDecimal: latest.rate.toString(),
        overridden: false,
        source: latest.source,
        stale: true,
      };
    }
  }
  throw new Error(
    `No exchange rate for ${fromCurrency}->${baseCurrency} on ${day.toISOString().slice(0, 10)}; provide one manually.`,
  );
}
```

- [ ] **Step 4: Pass the fetch impl from the transaction router**

In `packages/api/src/routers/transaction.ts`, both `createExpense` and `recordTransfer` call `resolveRateDecimal`. Add a helper just above `export const transactionRouter` :

```ts
import type { Context } from '../context.js';

function fxArgs(ctx: Context) {
  return ctx.fxFetch
    ? {
        fetchImpl: ctx.fxFetch,
        providerUrl: process.env.FX_PROVIDER_URL ?? 'https://api.frankfurter.app',
      }
    : undefined;
}
```

In `createExpense`, extend the call:

```ts
const { rateDecimal, overridden } = await resolveRateDecimal(
  ctx.prisma,
  input.currency,
  group.baseCurrency,
  input.date,
  input.exchangeRateToBase,
  group.fxLockedRate,
  fxArgs(ctx),
);
```

In `recordTransfer`, extend its call:

```ts
const { rateDecimal } = await resolveRateDecimal(
  ctx.prisma,
  input.currency,
  group.baseCurrency,
  date,
  undefined,
  undefined,
  fxArgs(ctx),
);
```

- [ ] **Step 5: Run the full api suite to verify pass + no regressions**

```bash
DATABASE_URL="postgresql://evenup:pass@localhost:55432/evenup" pnpm --filter @evenup/api exec vitest run
```

Expected: PASS (all existing + the 2 new FX tests).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/fx-service.ts packages/api/src/routers/transaction.ts packages/api/src/routers/integration.test.ts
git commit -m "feat(api): on-demand FX fetch + cache with stale fallback (FR-8.2, FR-8.5)"
```

---

## Task 7: `fx.resolve` query + web add-expense rate prefill

Add a query so the web form can look up (and cache) the day's rate, and prefill the exchange-rate field when a foreign currency is chosen — still editable as an override, with a source/stale indicator.

**Files:**

- Modify: `packages/api/src/routers/fx.ts`
- Modify: `apps/web/src/components/add-expense-form.tsx`

**Interfaces:**

- Consumes: `resolveRateDecimal` (Task 6); `ctx.fxFetch`.
- Produces: `fx.resolve({ base, quote, date? }) -> { rateDecimal: string; source: string; stale: boolean } | null`.

- [ ] **Step 1: Add the `fx.resolve` query**

In `packages/api/src/routers/fx.ts`, add the import and a new procedure inside `fxRouter`:

```ts
import { resolveRateDecimal } from '../services/fx-service.js';
```

```ts
  /** Resolve (and cache) the day's rate for base<-quote so the client can prefill. */
  resolve: protectedProcedure
    .input(z.object({ base: currencyCode, quote: currencyCode, date: z.coerce.date().optional() }))
    .query(async ({ ctx, input }) => {
      if (input.base === input.quote) return { rateDecimal: '1', source: 'identity', stale: false };
      const info = await resolveRateDecimal(
        ctx.prisma,
        input.quote,
        input.base,
        input.date ?? new Date(),
        undefined,
        null,
        ctx.fxFetch
          ? { fetchImpl: ctx.fxFetch, providerUrl: process.env.FX_PROVIDER_URL ?? 'https://api.frankfurter.app' }
          : undefined,
      ).catch(() => null);
      return info ? { rateDecimal: info.rateDecimal, source: info.source, stale: info.stale } : null;
    }),
```

- [ ] **Step 2: Prefill the rate in the add-expense form**

In `apps/web/src/components/add-expense-form.tsx`:

- Add `useEffect` to the imports from `react`:
  ```ts
  import { useEffect, useState } from 'react';
  ```
- After the existing `const [fxRate, setFxRate] = useState('');` and the `createExpense` mutation, add a query + prefill effect:
  ```ts
  const fxResolve = trpc.fx.resolve.useQuery(
    { base: baseCurrency, quote: currency },
    { enabled: currency !== baseCurrency },
  );
  useEffect(() => {
    // Prefill (do not clobber a value the user is editing).
    if (currency !== baseCurrency && fxResolve.data && fxRate === '') {
      setFxRate(fxResolve.data.rateDecimal);
    }
  }, [currency, baseCurrency, fxResolve.data, fxRate]);
  ```
- Under the existing FX `<Input id="e-fx" .../>`, add a small indicator:

  ```tsx
  {
    fxResolve.data ? (
      <p className="mt-1 text-xs text-neutral-500" data-testid="fx-source">
        {fxResolve.data.stale
          ? t('fx.cached', { date: '' })
          : fxResolve.data.source === 'frankfurter'
            ? `${t('fx.rate')} · Frankfurter`
            : t('fx.override')}
      </p>
    ) : null;
  }
  ```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @evenup/db exec prisma generate >/dev/null && pnpm turbo run typecheck --filter=@evenup/api --filter=@evenup/web
```

Expected: PASS.

- [ ] **Step 4: Update the FX E2E to assert prefill, then run it**

In `apps/web/e2e/critical-flow.spec.ts`, the "foreign-currency expense" test currently fills the rate manually. Point the E2E FX provider at a stub OR keep the manual override (the field still accepts it). Minimal change: after selecting EUR, assert the source hint appears when a rate resolves. Since the E2E web server has no live provider, the query returns `null` and the user types the rate — so keep the existing manual `expense-fx-input` fill (no assertion change strictly required). Add one assertion that the field is present and editable (already covered). Run:

```bash
cd apps/web && DATABASE_URL="postgresql://evenup:pass@localhost:55432/evenup" pnpm exec playwright test --project=chromium -g "foreign-currency"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/fx.ts apps/web/src/components/add-expense-form.tsx
git commit -m "feat(web): prefill FX rate from fx.resolve with source indicator (FR-8.2)"
```

---

## Task 8: GDPR export round-out + smart account deletion

Extend `user.exportData` to a full personal-data document, and add `user.deleteAccount` with the "smart" semantics: delete solo groups, deactivate + unlink members in shared groups, remove bank details / BYO key / sessions, then delete the user.

**Files:**

- Modify: `packages/api/src/routers/user.ts`
- Modify: `packages/api/src/routers/integration.test.ts` (test)

**Interfaces:**

- Produces: `user.exportData` (extended shape) and `user.deleteAccount() -> { ok: true }`.

- [ ] **Step 1: Write the failing test**

Add to `packages/api/src/routers/integration.test.ts`:

```ts
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
    groupId: shared.id,
    title: 'Dinner',
    currency: 'CZK',
    date: new Date(),
    payers: [{ memberId: oliviaMember.id, amountMinorUnits: 20000 }],
    split: { type: 'EQUAL', members: [{ memberId: oliviaMember.id }, { memberId: petrMember.id }] },
  });

  await oliviaCaller.user.deleteAccount();

  expect(await testPrisma.group.findUnique({ where: { id: solo.id } })).toBeNull();
  const keptGroup = await testPrisma.group.findUnique({ where: { id: shared.id } });
  expect(keptGroup).not.toBeNull(); // shared group survives for Petr
  const oliviaMemberAfter = await testPrisma.member.findUnique({ where: { id: oliviaMember.id } });
  expect(oliviaMemberAfter?.isActive).toBe(false); // deactivated (had a transaction)
  expect(oliviaMemberAfter?.userId).toBeNull(); // unlinked
  expect(await testPrisma.user.findUnique({ where: { id: olivia.id } })).toBeNull(); // user gone
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
DATABASE_URL="postgresql://evenup:pass@localhost:55432/evenup" pnpm --filter @evenup/api exec vitest run src/routers/integration.test.ts -t "smart-deletes"
```

Expected: FAIL — `user.deleteAccount` does not exist.

- [ ] **Step 3: Implement export round-out + deleteAccount**

In `packages/api/src/routers/user.ts`, replace `exportData` and add `deleteAccount`:

```ts
  /** GDPR export of the user's personal data (FR-1.6). */
  exportData: protectedProcedure.query(async ({ ctx }) => {
    const [profile, groups, bankDetails] = await Promise.all([
      ctx.prisma.user.findUniqueOrThrow({
        where: { id: ctx.user.id },
        select: { id: true, email: true, name: true, locale: true, defaultCurrency: true, createdAt: true },
      }),
      ctx.prisma.group.findMany({
        where: { OR: [{ createdById: ctx.user.id }, { members: { some: { userId: ctx.user.id } } }] },
        include: {
          members: true,
          transactions: { include: { payers: true, splits: true } },
          receipts: { select: { id: true, merchant: true, detectedCurrency: true, createdAt: true } },
        },
      }),
      ctx.prisma.bankDetail.findMany({
        where: { member: { userId: ctx.user.id } },
        select: { memberId: true, recipientName: true, variableSymbol: true },
      }),
    ]);
    return { profile, groups, bankDetails };
  }),

  /** GDPR account deletion (FR-1.6): delete solo groups, unlink shared ones. */
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    await ctx.prisma.$transaction(async (tx) => {
      const memberships = await tx.member.findMany({ where: { userId }, select: { id: true, groupId: true } });
      const groupIds = [...new Set(memberships.map((m) => m.groupId))];
      for (const groupId of groupIds) {
        // "Other linked members" = members with a different account. Explicit
        // not-null AND not-self to avoid Prisma null-handling ambiguity.
        const others = await tx.member.count({
          where: { groupId, AND: [{ userId: { not: null } }, { userId: { not: userId } }] },
        });
        if (others === 0) {
          await tx.group.delete({ where: { id: groupId } }); // solo -> cascade delete
          continue;
        }
        for (const m of memberships.filter((mm) => mm.groupId === groupId)) {
          await tx.bankDetail.deleteMany({ where: { memberId: m.id } }); // PII
          const used =
            (await tx.transactionSplit.count({ where: { memberId: m.id } })) +
            (await tx.transactionPayer.count({ where: { memberId: m.id } }));
          if (used > 0) {
            await tx.member.update({ where: { id: m.id }, data: { isActive: false, userId: null } });
          } else {
            await tx.member.delete({ where: { id: m.id } });
          }
        }
      }
      // Sessions + accounts cascade on user delete (schema onDelete: Cascade).
      await tx.user.delete({ where: { id: userId } });
    });
    return { ok: true as const };
  }),
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
DATABASE_URL="postgresql://evenup:pass@localhost:55432/evenup" pnpm --filter @evenup/api exec vitest run src/routers/integration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/user.ts packages/api/src/routers/integration.test.ts
git commit -m "feat(api): GDPR data export + smart account deletion (FR-1.6)"
```

---

## Task 9: GDPR settings UI (export + delete account)

Add a "Your data (GDPR)" card to the settings page: export downloads the JSON blob; delete asks for confirmation, deletes, signs out, and redirects.

**Files:**

- Modify: `apps/web/src/app/settings/page.tsx`
- Modify: `packages/i18n/src/locales/cs.ts` and `en.ts` (new keys)

**Interfaces:**

- Consumes: `user.exportData`, `user.deleteAccount` (Task 8); `signOut` from `@/lib/auth-client`.
- Produces: `settings.data.title`, `settings.data.export`, `settings.data.delete`, `settings.data.deleteConfirm` message keys.

- [ ] **Step 1: Add i18n keys (both catalogs)**

In `packages/i18n/src/locales/cs.ts` add (Czech source — keep `Messages` in sync):

```ts
  'settings.data.title': 'Vaše data (GDPR)',
  'settings.data.export': 'Exportovat moje data',
  'settings.data.delete': 'Smazat účet',
  'settings.data.deleteConfirm': 'Opravdu smazat účet? Tuto akci nelze vzít zpět.',
```

In `packages/i18n/src/locales/en.ts` add the matching keys:

```ts
  'settings.data.title': 'Your data (GDPR)',
  'settings.data.export': 'Export my data',
  'settings.data.delete': 'Delete account',
  'settings.data.deleteConfirm': 'Really delete your account? This cannot be undone.',
```

- [ ] **Step 2: Add the GDPR card + handlers**

In `apps/web/src/app/settings/page.tsx`:

- Extend the auth-client import:
  ```ts
  import { useSession, signOut } from '@/lib/auth-client';
  ```
- Add the export query (lazy) and delete mutation inside the component, after `clearKey`:

  ```ts
  const exportData = trpc.user.exportData.useQuery(undefined, { enabled: false });
  const deleteAccount = trpc.user.deleteAccount.useMutation({
    onSuccess: async () => {
      await signOut();
      window.location.href = '/';
    },
  });

  async function handleExport() {
    const res = await exportData.refetch();
    if (!res.data) return;
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'evenup-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  ```

- Before the closing `</div>` (after the OpenRouter `Card`), add the GDPR card:

  ```tsx
  <Card>
    <h3 className="mb-3 font-semibold">{t('settings.data.title')}</h3>
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" onClick={handleExport} data-testid="export-data-btn">
        {t('settings.data.export')}
      </Button>
      <Button
        variant="danger"
        data-testid="delete-account-btn"
        disabled={deleteAccount.isPending}
        onClick={() => {
          if (window.confirm(t('settings.data.deleteConfirm'))) deleteAccount.mutate();
        }}
      >
        {t('settings.data.delete')}
      </Button>
    </div>
  </Card>
  ```

  > `window.confirm` is acceptable here (a settings action the E2E does not traverse). Do not add `confirm()` calls in flows the E2E drives (see the browser-dialog note in the repo guidance).

- [ ] **Step 3: Typecheck + i18n unit test**

```bash
pnpm turbo run typecheck --filter=@evenup/web && pnpm --filter @evenup/i18n test
```

Expected: PASS (i18n test confirms cs/en key parity).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/settings/page.tsx packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts
git commit -m "feat(web): GDPR export + delete account in settings (FR-1.6)"
```

---

## Task 10: Activity router + edit-event logging

Add a read/filter API for the activity log, and log the missing edit events so the feed shows create/edit/delete/settle.

**Files:**

- Create: `packages/api/src/routers/activity.ts`
- Modify: `packages/api/src/root.ts` (mount it)
- Modify: `packages/api/src/routers/member.ts`, `packages/api/src/routers/group.ts` (log edits)
- Modify: `packages/api/src/routers/integration.test.ts` (test)

**Interfaces:**

- Produces: `activity.list({ groupId, memberId?, action?, cursor?, limit? }) -> { items: ActivityItem[]; nextCursor: string | null }` where `ActivityItem = { id: string; action: string; payload: unknown; createdAt: Date; actorName: string | null }`.

- [ ] **Step 1: Write the failing test**

Add to `packages/api/src/routers/integration.test.ts`:

```ts
it('lists activity and filters by action type (FR-9.1, FR-9.2)', async () => {
  const user = await createTestUser();
  const caller = makeCaller(user);
  const group = await caller.group.create({ name: 'Log', baseCurrency: 'CZK' });
  const m = await caller.member.add({ groupId: group.id, displayName: 'Petr' });
  await caller.transaction.createExpense({
    groupId: group.id,
    title: 'Chata',
    currency: 'CZK',
    date: new Date(),
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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
DATABASE_URL="postgresql://evenup:pass@localhost:55432/evenup" pnpm --filter @evenup/api exec vitest run src/routers/integration.test.ts -t "lists activity"
```

Expected: FAIL — `caller.activity` is undefined.

- [ ] **Step 3: Implement the activity router**

Create `packages/api/src/routers/activity.ts`:

```ts
/** Activity log read + filtering (PRD §4.9, FR-9.1/9.2). */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { assertGroupAccess } from '../access.js';

export const activityRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        memberId: z.string().optional(),
        action: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);

      // The actor is a User; map a member filter to that member's linked userId.
      let actorId: string | undefined;
      if (input.memberId) {
        const member = await ctx.prisma.member.findUnique({
          where: { id: input.memberId },
          select: { userId: true },
        });
        actorId = member?.userId ?? '__none__'; // virtual members are never actors
      }

      const rows = await ctx.prisma.activityLog.findMany({
        where: { groupId: input.groupId, action: input.action, actorId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          actor: {
            select: {
              members: { where: { groupId: input.groupId }, select: { displayName: true } },
            },
          },
        },
      });

      const nextCursor = rows.length > input.limit ? (rows.pop()?.id ?? null) : null;
      return {
        items: rows.map((r) => ({
          id: r.id,
          action: r.action,
          payload: r.payload as unknown,
          createdAt: r.createdAt,
          actorName: r.actor?.members[0]?.displayName ?? null,
        })),
        nextCursor,
      };
    }),
});
```

- [ ] **Step 4: Mount the router**

In `packages/api/src/root.ts`, add the import and the `activity` key:

```ts
import { activityRouter } from './routers/activity.js';
```

```ts
  activity: activityRouter,
```

- [ ] **Step 5: Log the edit events**

In `packages/api/src/routers/member.ts` `update`, capture the result and log:

```ts
const updated = await ctx.prisma.member.update({
  where: { id: input.memberId },
  data: {
    displayName: input.displayName,
    initials: input.displayName ? deriveInitials(input.displayName) : undefined,
    defaultShare: input.defaultShare,
    role: input.role,
    isActive: input.isActive,
  },
});
await logActivity(ctx.prisma, groupId, ctx.user.id, 'member.updated', {
  name: updated.displayName,
});
return updated;
```

In `packages/api/src/routers/group.ts` `update`, capture + log:

```ts
const updated = await ctx.prisma.group.update({
  where: { id: input.groupId },
  data: { name: input.name, simplifyDebts: input.simplifyDebts },
});
await logActivity(ctx.prisma, input.groupId, ctx.user.id, 'group.updated', {
  name: updated.name,
});
return updated;
```

In `packages/api/src/routers/group.ts` `archive`, capture + log:

```ts
const updated = await ctx.prisma.group.update({
  where: { id: input.groupId },
  data: { archivedAt: input.archived ? new Date() : null },
});
await logActivity(
  ctx.prisma,
  input.groupId,
  ctx.user.id,
  input.archived ? 'group.archived' : 'group.restored',
  { name: updated.name },
);
return updated;
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
DATABASE_URL="postgresql://evenup:pass@localhost:55432/evenup" pnpm --filter @evenup/api exec vitest run src/routers/integration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routers/activity.ts packages/api/src/root.ts packages/api/src/routers/member.ts packages/api/src/routers/group.ts packages/api/src/routers/integration.test.ts
git commit -m "feat(api): activity list/filter router + edit-event logging (FR-9.1, FR-9.2)"
```

---

## Task 11: OCR rate limiter (module + web singleton + apply in scan)

A pure, clock-injectable sliding-window limiter; a web singleton wired into the context (completing Task 3's placeholder); and enforcement in `ocr.scan`.

**Files:**

- Create: `packages/api/src/rate-limit.ts`
- Create: `packages/api/src/rate-limit.test.ts`
- Create: `apps/web/src/server/rate-limit.ts`
- Modify: `packages/api/src/index.ts` (export the factory)
- Modify: `packages/api/src/routers/ocr.ts` (enforce)
- Modify: `apps/web/src/server/trpc.ts` (restore the `ocrRateLimit` wiring from Task 3)
- Modify: `packages/api/src/routers/integration.test.ts` (test the 429 path)

**Interfaces:**

- Produces: `createRateLimiter(opts: { max: number; windowMs: number; now?: () => number }): RateLimiter` where `RateLimiter = { check(key: string): boolean }` (matches the inline type from Task 3). `check` returns `true` if allowed, `false` if over the limit.

- [ ] **Step 1: Write the failing unit test**

Create `packages/api/src/rate-limit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rate-limit.js';

describe('createRateLimiter', () => {
  it('allows up to max in a window, then blocks, then refills', () => {
    let t = 1_000;
    const limiter = createRateLimiter({ max: 2, windowMs: 1_000, now: () => t });
    expect(limiter.check('u1')).toBe(true);
    expect(limiter.check('u1')).toBe(true);
    expect(limiter.check('u1')).toBe(false); // 3rd within window
    t += 1_001; // window passed
    expect(limiter.check('u1')).toBe(true);
  });

  it('tracks keys independently', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1_000, now: () => 0 });
    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('b')).toBe(true);
    expect(limiter.check('a')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @evenup/api exec vitest run src/rate-limit.test.ts
```

Expected: FAIL — cannot resolve `./rate-limit.js`.

- [ ] **Step 3: Implement the limiter**

Create `packages/api/src/rate-limit.ts`:

```ts
/**
 * In-memory sliding-window rate limiter (PRD §9.2). Single-instance assumption
 * fits self-hosting. `now` is injectable for deterministic tests.
 */
import type { RateLimiter } from './context.js';

export function createRateLimiter(opts: {
  max: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const now = opts.now ?? (() => Date.now());
  const hits = new Map<string, number[]>();
  return {
    check(key: string): boolean {
      const t = now();
      const cutoff = t - opts.windowMs;
      const recent = (hits.get(key) ?? []).filter((ts) => ts > cutoff);
      if (recent.length >= opts.max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      return true;
    },
  };
}
```

> `Date.now()` here is production runtime code (allowed); tests always inject `now`.

- [ ] **Step 4: Run the unit test to verify it passes**

```bash
pnpm --filter @evenup/api exec vitest run src/rate-limit.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Export the factory + enforce in `ocr.scan`**

In `packages/api/src/index.ts` add:

```ts
export { createRateLimiter } from './rate-limit.js';
```

In `packages/api/src/routers/ocr.ts`, right after `await assertGroupAccess(...)` in `scan`:

```ts
if (ctx.ocrRateLimit && !ctx.ocrRateLimit.check(ctx.user.id)) {
  throw new TRPCError({
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many receipt scans; please wait a moment and try again.',
  });
}
```

- [ ] **Step 6: Create the web singleton + restore the context wiring**

Create `apps/web/src/server/rate-limit.ts`:

```ts
import 'server-only';
import { createRateLimiter } from '@evenup/api';

// 10 receipt scans per minute per user (PRD §9.2).
export const ocrRateLimit = createRateLimiter({ max: 10, windowMs: 60_000 });
```

In `apps/web/src/server/trpc.ts`, add the import `import { ocrRateLimit } from './rate-limit.js';` and add `ocrRateLimit,` to the `createContext({ ... })` call (Task 3 deliberately left this out).

- [ ] **Step 7: Write + run the api 429 test**

Add to `packages/api/src/routers/integration.test.ts`:

```ts
it('rate-limits OCR scans per user (§9.2)', async () => {
  const user = await createTestUser();
  const caller = makeCaller(user, { ocrRateLimit: { check: () => false } }); // always over the limit
  const group = await caller.group.create({ name: 'RL', baseCurrency: 'CZK' });
  await expect(
    caller.ocr.scan({ groupId: group.id, imageDataUrl: 'data:image/png;base64,AAAA' }),
  ).rejects.toThrow(/TOO_MANY_REQUESTS|Too many/);
});
```

> The rate-limit check must sit **before** the group's key/precondition checks in `scan` (Step 5 places it right after `assertGroupAccess`, so the 429 fires before the "add your API key" precondition — no key setup needed in the test).

```bash
DATABASE_URL="postgresql://evenup:pass@localhost:55432/evenup" pnpm --filter @evenup/api exec vitest run src/routers/integration.test.ts
```

Expected: PASS.

- [ ] **Step 8: Typecheck web + commit**

```bash
pnpm turbo run typecheck --filter=@evenup/web
git add packages/api/src/rate-limit.ts packages/api/src/rate-limit.test.ts packages/api/src/index.ts packages/api/src/routers/ocr.ts apps/web/src/server/rate-limit.ts apps/web/src/server/trpc.ts packages/api/src/routers/integration.test.ts
git commit -m "feat: rate-limit OCR scans per user (§9.2)"
```

---

## Task 12: Web activity feed with filters (rename Transactions, add Activity card)

Render the real activity log with member + action-type filters, and rename the current transaction list to "Transactions". Descriptions are localized by mapping each action to the existing generic `activity.*` templates (DRY — no new i18n keys).

**Files:**

- Create: `apps/web/src/lib/activity-message.ts`
- Create: `apps/web/src/components/activity-feed.tsx`
- Modify: `apps/web/src/components/group-detail.tsx`
- Modify: `packages/i18n/src/locales/cs.ts` and `en.ts` (add `nav.transactions`)

**Interfaces:**

- Consumes: `activity.list` (Task 10); `useI18n` `t`/`formatCurrency`/`formatDate`.
- Produces: `describeActivity(action, payload, t, formatCurrency, actorName): string`.

- [ ] **Step 1: Add `nav.transactions` i18n key (both catalogs)**

`cs.ts`: add `'nav.transactions': 'Transakce',`
`en.ts`: add `'nav.transactions': 'Transactions',`

- [ ] **Step 2: Implement the action → message mapper**

Create `apps/web/src/lib/activity-message.ts`:

```ts
import type { MessageKey, InterpolationValues } from '@evenup/i18n';

type T = (key: MessageKey, values?: InterpolationValues) => string;

/** Map an activity action + payload to a localized, human-readable line (FR-9.1). */
export function describeActivity(
  action: string,
  payload: unknown,
  t: T,
  formatCurrency: (minor: number) => string,
  actorName: string | null,
): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  const actor = actorName ?? '—';
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  switch (action) {
    case 'group.created':
      return t('activity.created', { actor, item: str(p.name) });
    case 'member.added':
      return t('activity.created', { actor, item: str(p.name) });
    case 'expense.created':
      return t('activity.created', { actor, item: str(p.title) });
    case 'expenses.imported':
      return t('activity.created', {
        actor,
        item: `${Number(p.created ?? 0)}× ${t('expense.add')}`,
      });
    case 'settlement.recorded':
      return t('activity.settled', { actor, amount: formatCurrency(Number(p.amount ?? 0)) });
    case 'transaction.deleted':
      return t('activity.deleted', { actor, item: str(p.title) });
    case 'member.updated':
    case 'group.updated':
    case 'group.archived':
    case 'group.restored':
      return t('activity.edited', { actor, item: str(p.name) });
    default:
      return t('activity.edited', { actor, item: action });
  }
}
```

> `formatCurrency` takes only the minor amount; the caller (Step 3) supplies a closure that applies the group's base currency (transfers are recorded in base, so that is correct).

- [ ] **Step 3: Build the ActivityFeed component**

Create `apps/web/src/components/activity-feed.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Card, Select, Button } from '@/components/ui';
import { describeActivity } from '@/lib/activity-message';

interface MemberLite {
  id: string;
  displayName: string;
}

const ACTION_OPTIONS = [
  'group.created',
  'member.added',
  'member.updated',
  'expense.created',
  'expenses.imported',
  'settlement.recorded',
  'transaction.deleted',
  'group.updated',
  'group.archived',
] as const;

export function ActivityFeed({
  groupId,
  members,
  baseCurrency,
}: {
  groupId: string;
  members: MemberLite[];
  baseCurrency: string;
}) {
  const { t, formatCurrency, formatDate } = useI18n();
  const [memberId, setMemberId] = useState('');
  const [action, setAction] = useState('');
  const query = trpc.activity.list.useQuery({
    groupId,
    memberId: memberId || undefined,
    action: action || undefined,
  });

  return (
    <Card>
      <h3 className="mb-3 font-semibold">{t('nav.activity')}</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        <Select
          aria-label={t('group.members')}
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          data-testid="activity-member-filter"
        >
          <option value="">{t('group.members')}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('nav.activity')}
          value={action}
          onChange={(e) => setAction(e.target.value)}
          data-testid="activity-action-filter"
        >
          <option value="">{t('common.total')}</option>
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </div>
      {query.data && query.data.items.length > 0 ? (
        <ul
          className="divide-y divide-neutral-100 dark:divide-neutral-800"
          data-testid="activity-list"
        >
          {query.data.items.map((it) => (
            <li key={it.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {describeActivity(
                  it.action,
                  it.payload,
                  (k, v) => t(k, v),
                  (minor) => formatCurrency(minor, baseCurrency),
                  it.actorName,
                )}
              </span>
              <span className="text-xs text-neutral-500">{formatDate(it.createdAt)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-sm text-neutral-500">—</p>
      )}
    </Card>
  );
}
```

> The `(minor) => formatCurrency(minor, baseCurrency)` closure matches the mapper's `formatCurrency: (minor: number) => string` param defined in Step 2 — the base currency is captured here.

- [ ] **Step 4: Rename the Transactions card + mount ActivityFeed in group-detail**

In `apps/web/src/components/group-detail.tsx`:

- Add the import:
  ```ts
  import { ActivityFeed } from '@/components/activity-feed';
  ```
- Change the existing transactions `Card`'s heading from `{t('nav.activity')}` to `{t('nav.transactions')}`.
- Immediately after that transactions `Card` (before the outer closing `</div>`), add:

  ```tsx
  <ActivityFeed
    groupId={groupId}
    members={activeMembers.map((m) => ({ id: m.id, displayName: m.displayName }))}
    baseCurrency={group.data.baseCurrency}
  />
  ```

- [ ] **Step 5: Typecheck + i18n test**

```bash
pnpm turbo run typecheck --filter=@evenup/web && pnpm --filter @evenup/i18n test
```

Expected: PASS. Fix the `describeActivity` `formatCurrency` signature per Step 3's resolution if the typecheck complains.

- [ ] **Step 6: Extend the E2E to assert the feed, then run it**

In `apps/web/e2e/critical-flow.spec.ts`, in the first test (after the expense is added), add:

```ts
// Activity feed shows the create events (FR-9.1).
await expect(page.getByTestId('activity-list')).toBeVisible();
await expect(page.getByTestId('activity-list')).toContainText(/Chata/);
// Filtering by type narrows the list.
await page.getByTestId('activity-action-filter').selectOption('expense.created');
await expect(page.getByTestId('activity-list')).toContainText(/Chata/);
```

```bash
cd apps/web && DATABASE_URL="postgresql://evenup:pass@localhost:55432/evenup" pnpm exec playwright test --project=chromium -g "sign in, create group"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/activity-message.ts apps/web/src/components/activity-feed.tsx apps/web/src/components/group-detail.tsx apps/web/e2e/critical-flow.spec.ts packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts
git commit -m "feat(web): filterable activity feed; rename transactions list (FR-9.1, FR-9.2)"
```

---

## Task 13: §9 accessibility verification pass

Add axe assertions on the settings and invite pages, run the full browser matrix, and fix any WCAG 2.1 AA violations found.

**Files:**

- Modify: `apps/web/e2e/critical-flow.spec.ts` (axe on settings + invite)
- Modify: any component with a violation (only if found)

**Interfaces:**

- Consumes: `AxeBuilder` (already imported in the spec).

- [ ] **Step 1: Add an a11y assertion to the OCR/settings test**

In the OCR test (which visits `/settings`), after the key is saved and `key-status` is visible, add:

```ts
const settingsA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
expect(settingsA11y.violations, JSON.stringify(settingsA11y.violations, null, 2)).toEqual([]);
```

- [ ] **Step 2: Add an invite-page a11y test**

Add a new test that creates a group, generates an invite, opens `/invite/<token>` in the same session, and asserts axe is clean:

```ts
test('invite page is accessible (§9.4)', async ({ page }, testInfo) => {
  const email = uniqueEmail('inv', testInfo.workerIndex + Date.now());
  await signIn(page, email);
  await page.getByTestId('new-group-btn').click();
  await page.getByTestId('group-name-input').fill('Invite');
  await page.getByTestId('create-group-submit').click();
  await page.getByText('Invite').click();
  await page.getByTestId('invite-btn').click();
  const url = await page.getByTestId('invite-url').textContent();
  await page.goto(new URL(url!).pathname);
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations, JSON.stringify(a11y.violations, null, 2)).toEqual([]);
});
```

- [ ] **Step 3: Run the full browser matrix**

```bash
cd apps/web && DATABASE_URL="postgresql://evenup:pass@localhost:55432/evenup" pnpm exec playwright test
```

Expected: PASS across chromium, firefox, webkit, mobile. If axe reports a violation (e.g. a `<Select>` filter missing a label, low-contrast text), fix it in the offending component — the filters in Task 12 already carry `aria-label`s — then re-run.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/critical-flow.spec.ts
# plus any component files fixed for a11y
git commit -m "test(web): a11y assertions on settings + invite; full matrix green (§9.4)"
```

---

## Task 14: Full-suite green + docs

Final verification across the whole workspace as CI runs it, and a short docs update.

**Files:**

- Modify: `README.md` and/or `docs/PRD.md` status note (optional), `docs/SELF_HOSTING.md` (confirm the two env additions are present)

- [ ] **Step 1: Whole-workspace gates (mirrors CI)**

With the dev DB up and `DATABASE_URL` exported:

```bash
pnpm --filter @evenup/db exec prisma generate
pnpm format:check
pnpm turbo run lint typecheck
pnpm turbo run test:coverage
pnpm --filter @evenup/web build
cd apps/web && pnpm exec playwright test && cd ../..
```

Expected: all PASS; `packages/core` coverage ≥ 95%.

- [ ] **Step 2: Format-fix if needed + commit**

```bash
pnpm format
git add -A
git commit -m "chore: finish web app to PRD Phase 1+2 — docs + formatting"
```

- [ ] **Step 3: Push the branch and open a PR**

```bash
git push -u origin feat/web-finish-phase1-2
gh pr create --title "Finish web app to PRD Phase 1+2" --body "Closes receipt storage (FR-5.8), FX auto-fetch (FR-8.2/8.5), GDPR export+delete (FR-1.6), filterable activity feed (FR-9.1/9.2), OCR rate limiting (§9.2), and the local E2E papercut + a11y pass (§9.4). Note: rotate the Resend key that was in apps/web/.env.local."
```

---

## Self-review notes (author)

- **Spec coverage:** Item 0 → Task 1; receipt storage (FR-5.8) → Tasks 2–4; FX (FR-8.2/8.5) → Tasks 5–7; GDPR (FR-1.6) → Tasks 8–9; activity feed (FR-9.1/9.2) → Tasks 10, 12; OCR rate limit (§9.2) → Task 11; a11y (§9.4) → Task 13; cross-cutting green + docs → Task 14. All spec sections mapped.
- **Type consistency:** `RateLimiter` is declared once in `context.ts` (Task 3) and implemented by `createRateLimiter` (Task 11); `ObjectStore`/`parseImageDataUrl` defined in Task 2 and consumed in Tasks 3–4; `resolveRateDecimal`'s new 7th param `fetch?: ResolveRateFetch` is defined in Task 6 and passed in Tasks 6–7; `describeActivity` currency-formatter signature is pinned to `(minor: number) => string` (Task 12, Step 3 resolution).
- **Ordering:** Task 3 wires `ocrRateLimit` with a documented placeholder that Task 11 completes — the only forward reference, called out explicitly in both tasks.

```

```
