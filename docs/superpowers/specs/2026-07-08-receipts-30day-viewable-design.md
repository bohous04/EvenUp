# EvenUp — 30-day viewable receipts (MinIO-backed) — design spec

> **Status:** approved design, ready to plan
> **Date:** 2026-07-08
> **Supersedes:** the earlier decision "store + auto-delete immediately, no display" (2026-07-07 spec, decision 1).

## 1. Goal

Let users **view a receipt's image for 30 days** after scanning, then auto-delete it. This reverses the prior privacy-first "delete immediately, no viewing" behavior into a bounded-retention, viewable model, backed by a real S3 store (self-hosted MinIO), capped at 50 GB.

### Confirmed decisions
1. **Backend:** self-hosted **MinIO** on Coolify (NetCup VPS), S3 API internal-only. MinIO does not support network-FS backends, so it uses local VPS disk.
2. **Cap:** bucket **50 GB hard quota**. On overflow, uploads fail gracefully (storage is best-effort → OCR/expense unaffected, image just not stored). No eviction.
3. **Retention:** **30 days** default, then deleted by a daily cleanup job.
4. **Viewing:** server-proxied route with session + group-access checks (never public/presigned URLs).

### Non-goals
- Receipt editing/annotation, thumbnails, multi-image per expense, or eviction-based capping.

## 2. Storage backend (ops, MinIO on Coolify)

- Deploy MinIO as a Coolify resource on the NetCup VPS with a persistent volume; strong root user/password; S3 API **not** publicly exposed (EvenUp reaches it on the internal `coolify` network); console optionally exposed behind auth.
- Bucket `evenup-receipts`; **hard quota 50 GiB** (`mc quota set --size 50Gi --type hard`).
- Set on the EvenUp app: `STORAGE_ENDPOINT` (internal MinIO URL), `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET=evenup-receipts`, `STORAGE_REGION=us-east-1`.

## 3. Code changes

### 3.1 ObjectStore — add read
`packages/api/src/storage/object-store.ts`:
- Extend the interface with `getObject(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null>` (null when absent).
- S3 impl: `GetObjectCommand`, read the body to bytes, return with `ContentType`. On `NoSuchKey`/404 → null.
- `createNoopObjectStore().getObject` → null.
- New `createInMemoryObjectStore()` (module-singleton Map) for dev/E2E, so a scan-then-view round-trip works without MinIO.

### 3.2 Retention model
- Replace `RECEIPT_AUTO_DELETE` (boolean) with **`RECEIPT_RETENTION_DAYS`** (integer, default **30**). `0` = delete immediately after OCR (old behavior); `>0` = keep that many days.
- `packages/api/src/routers/ocr.ts` `scan`: upload the image; if `retentionDays === 0` delete immediately + clear `storageKey`; else persist `storageKey`. (Reads `process.env.RECEIPT_RETENTION_DAYS`, matching the existing direct-env style; default 30.)
- `apps/web/src/server/env.ts`: add `receiptRetentionDays` (parsed int, default 30). Remove `receiptAutoDelete`. Update `.env.example` + `docs/SELF_HOSTING.md`.

### 3.3 Cleanup job
- New `packages/api/src/services/receipt-cleanup.ts`: `cleanupExpiredReceipts({ prisma, objectStore, retentionDays, now }): Promise<{ deleted: number }>` — finds receipts with non-empty `storageKey` and `createdAt < now - retentionDays`, calls `deleteObject` (best-effort per row), clears `storageKey`. Pure w.r.t. injected deps → unit + integration testable.
- New route `apps/web/src/app/api/cron/receipt-cleanup/route.ts` (`POST`): requires `Authorization: Bearer ${CRON_SECRET}` (constant-time compare; 401 otherwise); builds prisma + object store; runs the service; returns `{ deleted }`.
- **Ops:** `CRON_SECRET` env on the app + a Coolify **daily scheduled task** that calls the route from inside the container (`node -e "fetch('http://127.0.0.1:3000/api/cron/receipt-cleanup',{method:'POST',headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>r.text()).then(console.log)"`).

### 3.4 Viewing route
- New route `apps/web/src/app/api/receipts/[id]/route.ts` (`GET`):
  1. `auth.api.getSession({ headers })` → 401 if no user.
  2. Load the receipt (`id`) → `groupId`, `storageKey`. 404 if missing or `storageKey` empty (expired/never stored).
  3. Authorize: the user must be the group creator or a linked member → else 403.
  4. `objectStore.getObject(storageKey)` → stream bytes with `Content-Type` and `Cache-Control: private, max-age=300`. 404 if the object is gone.
- Shared `apps/web/src/server/object-store.ts`: `getObjectStore()` returns in-memory (when `AUTH_DEV_ECHO==='true'` — dev/E2E), else S3 (when `STORAGE_*` set), else noop. Used by the tRPC context, the view route, and the cron route (single source of truth).

### 3.5 Surfacing in the UI
- `packages/api/src/routers/transaction.ts` `list`: include the linked receipt's id + storageKey, mapping each tx to include `receiptId: string | null` and `hasReceiptImage: boolean`.
- `apps/web/src/components/group-detail.tsx` Transactions list: for a tx with `hasReceiptImage`, render a **"View receipt"** link (`<a href={/api/receipts/${receiptId}} target="_blank">`), with a `Receipt` icon and an i18n label. New key `receipt.view` in `cs.ts` + `en.ts`.

### 3.6 Schema
- Add `@@index([createdAt])` to `Receipt` (cleanup query). One forward-only Prisma migration; applied on boot by the entrypoint.

## 4. Test strategy (no MinIO in CI)
- **Unit** (`packages/api`): retention cutoff math; `cleanupExpiredReceipts` selects only expired rows with a stored key, clears keys, tolerates a delete that throws (best-effort).
- **Integration** (fake in-memory `ObjectStore` via `makeCaller`): `scan` keeps `storageKey` when `RECEIPT_RETENTION_DAYS>0` and clears it when `0`; `transaction.list` returns `hasReceiptImage`; cleanup deletes only expired.
- **View-route access** — exercised at integration level via a small membership-check helper, plus an E2E: OCR flow (in-memory store, dev flag) → "View receipt" link appears → `/api/receipts/[id]` returns 200 for a member; a request without a session returns 401.
- E2E stays hermetic: the in-memory store (dev flag) makes scan-then-view work without MinIO.

## 5. Security & ops
- MinIO S3 API internal-only; bucket non-public; strong root creds.
- View route: session + group-access gated; no public/presigned URLs.
- Cron route: `CRON_SECRET` bearer, constant-time compare.
- Best-effort storage preserved: put/get/delete failures never break OCR, expense creation, or the transaction list.
- Backward-compat note: `RECEIPT_RETENTION_DAYS` unset defaults to 30 (intended behavior change from immediate-delete).

## 6. Definition of Done
Code + unit/integration/E2E tests green; CZ+EN strings for the view link; migration applies cleanly; MinIO provisioned with the 50 GB quota; EvenUp env + Coolify scheduled task configured; deployed and a real scan→view round-trip verified on evenup.lnrtdev.cz.
