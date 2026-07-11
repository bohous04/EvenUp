# EvenUp — multi-page receipt import (screenshots + PDF) — design spec

> **Status:** approved design, ready to plan
> **Date:** 2026-07-11
> **Builds on:** OCR scan (`packages/api/src/ocr`, `ocr.scan`) and 30-day viewable receipts (`2026-07-08-receipts-30day-viewable-design.md`).

## 1. Goal

Let a user import **one receipt that spans several pages** into the **web** app:

- **N screenshots** — e.g. a long digital receipt from a store's mobile app (Albert) captured as ~3 screenshots, and
- **a PDF** — the same receipt exported to PDF, where the store allows it.

Both feed the existing OCR flow and produce a **single** itemized expense. Today `ocr.scan` accepts exactly one image, so both inputs are new.

### Confirmed decisions

1. **Platform:** **web only** for now. The mobile app (`apps/mobile/app/scan.tsx`) keeps its single-image flow unchanged; the shared API stays backward-compatible with it.
2. **Extraction:** **one combined OpenRouter call** — all pages in a single request, one reconciled receipt JSON. Not per-page-then-merge.
3. **PDF:** sent **natively** as an OpenRouter `file` content part (no client-side `pdf.js`, no rasterizing).
4. **Preview storage (VIP):** store **all pages** (every screenshot + the full PDF), viewable. Requires a DB change and a serve-route change.
5. **Limits:** max **10 pages** per scan; per-image downscale (existing); PDF cap ~10 MB.

### Non-goals

- Any mobile change. Editing/annotating pages. A full paged lightbox viewer (link opens page 0; paged viewer is optional later polish). Non-receipt document parsing.

## 2. Extraction — combined multi-part call

`packages/api/src/ocr/openrouter-adapter.ts`:

- `ExtractReceiptArgs.imageDataUrl: string` → **`pages: string[]`** (1..N data URLs, each `data:image/*` or `data:application/pdf`).
- `buildBody(pages, model)` builds `content` as `[{ type: 'text', text: PROMPT }, ...parts]`, mapping each page:
  - `data:image/*` → `{ type: 'image_url', image_url: { url } }`
  - `data:application/pdf` → `{ type: 'file', file: { filename: 'receipt.pdf', file_data: url } }` (the adapter only receives data URLs, so `filename` is a constant — OpenRouter just needs some name)
- When **any** page is a PDF, add `plugins: [{ id: 'file-parser', pdf: { engine: OCR_PDF_ENGINE } }]`. Default engine **`pdf-text`** (free, text-layer digital receipts); overridable via env `OCR_PDF_ENGINE` (e.g. `mistral-ocr` for scanned PDFs, paid). No `plugins` field when there is no PDF.
- Prompt gains: _"The pages belong to ONE receipt (multiple screenshots or PDF pages) — combine them into a single receipt; do not duplicate items repeated in page headers/footers; the grand total appears once."_
- Everything downstream is unchanged: zod validation, retry-once, decimal→minor conversion, and reconciliation (`itemsSumMinorUnits` vs `totalMinorUnits`) still yield **one** `OcrResult`.
- `callOnce`/timeout/retry loop unchanged except it now carries the assembled body.

## 3. API `ocr.scan` — backward-compatible input

`packages/api/src/routers/ocr.ts`:

- Input becomes a union so the **mobile client keeps working**:
  - legacy: `{ groupId, imageDataUrl: string.startsWith('data:image/') }`
  - new: `{ groupId, pages: string[] }` — each `data:image/*` **or** `data:application/pdf`; `.min(1).max(MAX_PAGES)` (MAX_PAGES = 10).
- Normalize to a `pages: string[]` list up front (`imageDataUrl` → `[imageDataUrl]`), then the rest of the handler works off `pages`.
- Key resolution (BYO vs VIP shared), rate limit (one scan = one `check`, regardless of page count), error handling, and the `FAILED` receipt record on error are all unchanged.
- Pass `pages` to `extractReceipt`.

## 4. Preview storage (VIP, best-effort)

- Generalize `parseImageDataUrl` → **`parseDataUrl`** in `packages/api/src/storage/object-store.ts`: accept `data:image/*` **and** `data:application/pdf`; return `{ bytes, contentType, ext }` (`ext` `pdf` for PDFs). Keep the old name as a thin alias if any caller still imports it, or update the caller.
- In `scan`, when `ctx.objectStore && user.isVip`: for **each** page, `putReceipt` under `receipts/{groupId}/{uuid}.{ext}` and collect the keys into `storageKeys: string[]`. Best-effort — a per-page failure drops that page's key but never blocks OCR; a total failure yields `[]`.
- `RECEIPT_RETENTION_DAYS === 0`: after storing, delete every stored key and set `storageKeys = []` (unchanged semantics, now over the array).
- Persist `storageKeys` on the `Receipt` (see §6). Content-type is **not** stored — it comes back from S3 `getObject().contentType`.

## 5. Serve route `/api/receipts/[id]`

`apps/web/src/app/api/receipts/[id]/route.ts`:

- Select `storageKeys` (array). 404 if empty.
- Accept `?page=N` query (default `0`); clamp to `[0, storageKeys.length-1]`; serve `storageKeys[N]`.
- Session + group-access checks unchanged.
- **Content type:** images keep the raster whitelist + inline behavior. **PDF** (`application/pdf`) is served inline under the existing hardened headers (`Content-Security-Policy: default-src 'none'; sandbox;`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=300`). This is the one security-sensitive choice — flag it in code review; the conservative fallback is `Content-Disposition: attachment` (download instead of inline).

## 6. Schema

`packages/db/prisma/schema.prisma` — `Receipt`:

- Replace `storageKey String` with **`storageKeys String[] @default([])`** (Postgres text array).
- One forward-only migration that **copies** each existing non-empty `storageKey` into a single-element `storageKeys`, then drops `storageKey`. Applied on boot by the entrypoint.

Readers updated accordingly:

- `packages/api/src/routers/transaction.ts`: `receipt` select → `{ id, storageKeys }`; expose `hasReceiptImage: (receipt?.storageKeys.length ?? 0) > 0` and new `receiptPageCount: receipt?.storageKeys.length ?? 0`.
- `packages/api/src/services/receipt-cleanup.ts`: select rows with a non-empty `storageKeys` (`storageKeys: { isEmpty: false }`), `deleteObject` **each** key (best-effort), and clear to `[]` **only** after all succeed (preserves the retry-next-run semantics; a partial failure leaves the row for the next run).

## 7. Web UI — `OcrScan`

`apps/web/src/components/ocr-scan.tsx`:

- Inputs: keep the single-shot **camera** input; add a **multi-image** input (`accept="image/*" multiple`) and a **PDF** input (`accept="application/pdf"`).
- **Preview before scan:** a list of picked pages (image thumbnails / a "PDF: <filename>" row) with **remove** and **reorder** (up/down or drag) — order matters for reading a multi-page receipt. Icons from `@/components/icons` (no emoji).
- On scan: run each image through the existing `downscaleImage`; read the PDF as a base64 data URL (guard ~10 MB); assemble `pages: string[]` and call `scan.mutate({ groupId, pages })`. The single-file `onFile` path is folded into the same `pages` assembly.
- The rest of the flow (edit/add/delete items, assign to members, running total, per-person breakdown, save as itemized expense) is unchanged.
- New i18n keys (cs + en): pick multiple screenshots, add/remove page, reorder, import PDF, page count. Reuse existing `ocr.*` keys where possible.

## 8. Viewing in the transactions list

`apps/web/src/components/group-detail.tsx`:

- The existing "view receipt" link opens `/api/receipts/{receiptId}` (page 0). When `receiptPageCount > 1`, show the count next to the link (e.g. "View receipt (3)"). A paged lightbox is explicitly out of MVP scope.

## 9. Test strategy (no live API, no MinIO in CI)

- **Adapter** (`openrouter-adapter.test.ts`): given 2–3 image pages, the request body has one `text` part + N `image_url` parts and **no** `plugins`; given a PDF page, the body has a `file` part **and** `plugins` with `pdf-text`; the parsed/reconciled result is a single receipt; retry-once still holds.
- **`ocr` router** (integration via `makeCaller`, in-memory store): legacy `imageDataUrl` still scans; `pages[]` scans; a VIP scan stores **N** keys into `storageKeys`; `RECEIPT_RETENTION_DAYS=0` clears them; page cap and data-URL validation reject bad input.
- **Cleanup**: deletes every key in `storageKeys` and clears to `[]`; a delete that throws leaves the row for the next run (no partial clear).
- **Serve route**: `?page=N` selects the right object; out-of-range clamps; PDF returns `application/pdf` under the sandbox headers; access control (401/403) unchanged.
- **E2E** stays hermetic on the in-memory store (dev flag): multi-image import → items appear → save; and scan→"view receipt" round-trip returns 200 for a member.

## 10. Security & ops

- Backward compatibility: mobile's `imageDataUrl` input path is preserved; the DB migration back-fills existing single keys.
- Best-effort storage preserved: put/get/delete failures never break OCR, expense creation, or the transaction list.
- PDF inline serving relies on the existing `sandbox` CSP + `nosniff`; called out for review (attachment is the conservative alternative).
- Cost: multi-image scans cost more vision tokens; PDF via `pdf-text` is cheap/free. The 10-page cap and per-image downscale bound the payload and cost; the per-user OCR rate limit is unchanged (one scan = one call).
- New env: `OCR_PDF_ENGINE` (default `pdf-text`) — document in `.env.example` + `docs/SELF_HOSTING.md`.

## 11. Definition of Done

Adapter/router/cleanup/serve changes with unit + integration + E2E green; CZ+EN strings; Prisma migration back-fills and applies cleanly; `OcrScan` supports multi-image + PDF with reorder/remove preview; a real multi-screenshot **and** a real PDF import verified on evenup.lnrt.cz producing one correct itemized expense, with all pages viewable for a VIP.
