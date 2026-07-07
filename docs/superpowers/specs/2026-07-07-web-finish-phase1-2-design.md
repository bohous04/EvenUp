# EvenUp Web — Finish to PRD Phase 1+2 (design spec)

> **Status:** approved design, ready to plan
> **Date:** 2026-07-07
> **Scope owner:** web app (`apps/web`) + shared `packages/api`, `packages/db`, `packages/i18n`
> **Related:** [`docs/PRD.md`](../../PRD.md)

## 1. Context & goal

The EvenUp web app is already feature-complete for most of PRD Phase 1 (MVP) and
Phase 2, and every automated gate is green (verified 2026-07-07):

| Gate                                                                                      | Result                         |
| ----------------------------------------------------------------------------------------- | ------------------------------ |
| Typecheck (6 packages, incl. web + mobile)                                                | pass                           |
| Lint                                                                                      | pass (2 warnings, mobile only) |
| Unit — `core` / `i18n`                                                                    | 195 / 19 pass                  |
| Integration — `api` (tRPC + ephemeral Postgres)                                           | 39 pass                        |
| Web production build (`next build`)                                                       | pass                           |
| Playwright E2E — 6 critical flows (chromium verified; CI also runs firefox/webkit/mobile) | pass                           |

This spec closes the remaining PRD **Phase 1+2 (strict)** gaps so the web app is
"done" per the PRD Definition of Done (§10.3): code + tests + CZ/EN strings +
E2E, green CI, a11y pass.

### Confirmed design decisions

1. **Receipt storage:** store to S3/MinIO, then **auto-delete after successful OCR** (instance-level env, default on). **No image-viewing UI.**
2. **FX rate:** **on-demand fetch-and-cache** from Frankfurter (no scheduler). Fall back to last cached rate, then manual.
3. **§9 verification:** run the full a11y (axe) matrix across all four Playwright projects and fix violations. **No visual-regression snapshots.**
4. **GDPR delete:** **smart** — delete groups where the user is the only member; for shared groups deactivate + unlink their member so history survives.

### Guiding pattern (already established in the codebase)

External dependencies are injected through the tRPC **context** (see
`packages/api/src/context.ts`: `prisma`, `secretBox`, `ocrFetch`). Every new
external dependency in this spec follows the same pattern so unit/integration
tests use in-memory fakes and **CI makes no live S3 / FX / OpenRouter calls**.

### Non-goals (explicitly out of scope here)

- Apple OAuth (mobile / iOS concern; magic link + Google already work) — Phase 3.
- Web push notifications (FR-11 is "mobile-first, later web").
- Real-time sync, offline write-sync (Phase 4).
- Receipt image viewing / thumbnails (decision 1: no display).
- FX scheduler / cron (decision 2: on-demand only).
- Visual-regression snapshots (decision 3).

---

## 2. Work items

Each item is independently shippable (code + tests + CZ/EN strings where
user-facing). Item 0 is a prerequisite for running E2E locally.

### Item 0 — Fix local E2E env papercut (prerequisite, trivial)

**Problem:** `apps/web/.env.local` contains a live `RESEND_API_KEY`, which
`next start` auto-loads. The Playwright `webServer` therefore tries to send magic
links via Resend to fake `*@example.com` test addresses; Resend rejects them,
`sendMagicLink` throws, and all E2E tests fail at sign-in. CI passes only because
it has no `.env.local`.

**Change:** in `apps/web/playwright.config.ts`, set `RESEND_API_KEY: ''` and
`SMTP_HOST: ''` in `webServer.env` so local E2E always uses the console/dev-echo
mail path (`AUTH_DEV_ECHO=true` already set there).

**Acceptance:** `pnpm --filter @evenup/web test:e2e` is green locally with no
manual env manipulation.

**Also (ops, not code):** rotate the `RESEND_API_KEY` currently sitting in
`apps/web/.env.local` (it is gitignored, but it is a real secret on disk).

---

### Item 1 — Receipt image storage (FR-5.1, FR-5.8)

**Current state:** `packages/api/src/routers/ocr.ts` writes `storageKey: ''` —
the uploaded image is sent to the OCR adapter and then discarded. MinIO is in
`docker-compose.yml` but unused.

**Design:**

- New module `packages/api/src/storage/object-store.ts` exporting an
  `ObjectStore` interface:
  ```ts
  interface ObjectStore {
    putReceipt(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
    deleteObject(key: string): Promise<void>;
  }
  ```
  - `createS3ObjectStore(config)` — `@aws-sdk/client-s3` with
    `forcePathStyle: true` (MinIO-compatible), built from `STORAGE_*` env.
  - `createNoopObjectStore()` — used when storage env is unset, so OCR still
    works on a bare self-host. Also the default in tests via a fake.
- Inject as `ctx.objectStore` (extend `context.ts` + `createContext`). Wire a
  concrete store in the web tRPC route (`apps/web/src/app/api/trpc/[trpc]/route.ts`).
- In `ocr.ts scan`:
  1. Decode `imageDataUrl` → bytes + content-type + extension.
  2. `key = "receipts/{groupId}/{receiptId}.{ext}"`, `putReceipt(...)`,
     persist `storageKey`.
  3. If `env.receiptAutoDelete` (default **true**): after a successful
     extraction, `deleteObject(key)` and clear `storageKey` on the receipt row.
- **Best-effort:** all storage calls are wrapped so a storage failure is logged
  and never blocks OCR or expense creation (privacy-first "tracker" positioning).

**Env:** add `RECEIPT_AUTO_DELETE` (default `'true'`) to `apps/web/src/server/env.ts`,
`.env.example`, and `docs/SELF_HOSTING.md`. `STORAGE_*` already documented.

**Data model:** none. `Receipt.storageKey` already exists.

**Tests (api integration, in-memory fake store):**

- Successful scan uploads the exact image bytes to the derived key.
- `RECEIPT_AUTO_DELETE=on` → `deleteObject` called, `storageKey` cleared.
- `RECEIPT_AUTO_DELETE=off` → object retained, `storageKey` persisted.
- A `putReceipt` that throws does **not** fail the scan (still returns items).

---

### Item 2 — FX on-demand fetch-and-cache (FR-8.2, FR-8.5)

**Current state:** `FX_PROVIDER_URL` (Frankfurter) is defined in env but never
called. Rates come only from a per-group locked rate, a manual override, or a
pre-existing cached row; otherwise `resolveRateDecimal` throws "provide manually".

**Design:**

- New module `packages/api/src/services/fx-provider.ts`:
  ```ts
  fetchRate(opts: {
    baseCurrency: string; quoteCurrency: string; date: Date;
    providerUrl: string; fetchImpl: FetchLike;
  }): Promise<{ rateDecimal: string; source: string } | null>
  ```
  Calls Frankfurter `GET {providerUrl}/{yyyy-mm-dd}?from={quote}&to={base}`
  (Frankfurter returns the multiplier `from → to`; with `from=quote, to=base`
  this yields `base = amount_quote * rate`, matching `core.convert`). Returns
  `null` on any provider error/timeout (no throw).
- Inject `ctx.fxFetch: FetchLike` (same shape as `ocrFetch`) so CI/tests use a
  fake.
- Extend `resolveRateDecimal` (`services/fx-service.ts`) resolution order:
  1. same currency → `1`
  2. explicit override → override (`overridden: true`)
  3. per-group locked rate → locked
  4. cached `FxRate` row for that exact day → cached
  5. **new:** `fetchRate(...)` → on success, upsert `FxRate`
     (`source: 'frankfurter'`) and return
  6. **new:** provider failed → newest cached row for the pair (any date),
     returned with `stale: true`
  7. else throw (client surfaces "enter the rate manually")
     Return type gains `source: string` and `stale: boolean`; update callers in
     `routers/transaction.ts`.
- New `fx.resolve` query (`routers/fx.ts`): given `{base, quote, date}` returns
  the resolved `{ rateDecimal, source, stale }` (fetching + caching as needed) so
  the web form can prefill.
- **Web** (`components/add-expense-form.tsx`): when currency ≠ base, call
  `fx.resolve` to **prefill** `expense-fx-input` (still user-editable → override),
  and show a small indicator: `source` ("auto · Frankfurter") or a "stale rate"
  badge. Backward-compatible with the existing FX E2E, which types an override.

**Env:** `FX_PROVIDER_URL` already in `.env.example`; wire into web env + context.

**Data model:** none. `FxRate` + `Group.fxLockedRate` already exist.

**Tests (api integration, fake `fxFetch`):**

- Foreign-currency expense with no cache → provider fetched, `FxRate` cached,
  amount converted to base correctly.
- Second expense same day → served from cache (provider not called again).
- Provider returns error → falls back to newest cached row, `stale: true`.
- No cache + provider down → resolves to a manual-entry error surfaced to client.

---

### Item 3 — GDPR export + smart account deletion (FR-1.6)

**Current state:** `user.exportData` exists (groups + transactions only). No
account deletion.

**Design:**

- **Export:** extend `user.exportData` to a single JSON document: profile
  (`email, name, locale, defaultCurrency`), memberships, transactions
  (payers + splits), bank details, receipt metadata, and the user's activity.
- **Delete:** new `user.deleteAccount` mutation, one Prisma transaction:
  - For each member linked to the user:
    - member appears in any transaction (payer/split/transfer) →
      `isActive: false, userId: null` (preserve history per FR-2.4);
    - otherwise → delete the member.
  - Groups where the user is the **only** member → delete the group (cascades
    transactions/members/etc.).
  - Delete `BankDetail` rows belonging to the user's members (PII).
  - Clear `openRouterKeyEncrypted`.
  - Delete Better-Auth `session` + `account` rows for the user, then the `user`.
- **Web settings** (`app/settings/page.tsx`): a "Your data (GDPR)" card with
  - "Export my data" → downloads the JSON blob;
  - "Delete account" → confirm modal → mutation → Better-Auth `signOut` →
    redirect to `/`. CZ/EN strings.

**Data model:** none (relies on existing cascade relations; verify
`onDelete: Cascade` on group children in `schema.prisma`, add if missing —
migration only if a relation lacks it).

**Tests (api integration):**

- User in (a) a solo group and (b) a shared group with transactions →
  `deleteAccount` → solo group deleted; shared group survives with the user's
  member `isActive:false, userId:null`; bank details, encrypted key, and
  sessions removed; `user` row gone.
- `exportData` returns the extended shape.

---

### Item 4 — Real, filterable activity feed (FR-9.1, FR-9.2)

**Current state:** `activityLog` rows are written by some routers
(`group.created`, `member.added`, `expense.created`, `settlement.recorded`,
`transaction.deleted`) but **never read**. The web "Activity" card actually
renders the transactions list. No filtering. Edit events are not logged.

**Design:**

- New `activityRouter` mounted in `root.ts`:
  `activity.list({ groupId, memberId?, action?, cursor?, limit })` →
  access-checked, paginated (`cursor` on `createdAt`+`id`), newest first,
  filterable by actor (mapped to the group member) and by `action` type. Each row
  returns `{ id, action, payload, createdAt, actor: { memberId?, displayName } }`.
- Add missing `logActivity` calls on **edit** paths so create/edit/delete/settle
  are all captured: `transaction.update`, `member.update`, `group.archive`.
- **i18n:** add CZ/EN message keys for each action type (e.g.
  `activity.expense.created`, `activity.settlement.recorded`, …). The client
  renders a localized human-readable line from `action` + `payloadJson`
  (FR-9.1: "human-readable description (localized)").
- **Web** (`components/group-detail.tsx`): rename the existing card to
  **Transactions** (keep the list), and add a new **Activity** card with:
  - a member filter dropdown (group members),
  - an action-type filter dropdown,
  - the localized log list, paginated ("load more").
    Actor is shown as the group member `displayName` (map `actorId` → the member
    whose `userId` matches).
- **Migration (optional, perf §9.1):** add indexes on
  `ActivityLog(groupId, createdAt)` and `(groupId, actorId, action)`.

**Tests:**

- api: create/edit/delete/settle each write a log row; `activity.list` filters by
  member and by action type; pagination returns a stable order.
- E2E: after adding an expense and settling a payment, the Activity card shows the
  corresponding entries; applying the member filter narrows the list.

---

### Item 5 — OCR endpoint rate limiting (§9.2)

**Current state:** auth is rate-limited by Better Auth (enabled when
`!authDevEcho`); the OCR `scan` endpoint is not.

**Design:**

- New pure module `packages/api/src/rate-limit.ts`: an in-memory sliding-window
  limiter keyed by a string (userId), with an **injectable clock** for
  deterministic tests. Single-instance assumption matches self-hosting.
  ```ts
  createRateLimiter({ max, windowMs, now }): { check(key): boolean }
  ```
- Apply in `ocr.scan`: on `check(userId) === false` → throw
  `TRPCError({ code: 'TOO_MANY_REQUESTS' })`. Default: a small N per minute per
  user (exact value fixed in the plan; documented).

**Tests:**

- unit: allows `max` calls in a window, blocks `max+1`, refills after the window
  (via injected clock).
- api: repeated `scan` beyond the limit throws `TOO_MANY_REQUESTS`.

---

### Item 6 — §9 non-functional verification pass

**Design:**

- Run the full Playwright matrix (chromium / firefox / webkit / mobile) to green
  after item 0.
- Add `@axe-core/playwright` assertions on the **settings** page and the
  **invite** page (currently axe runs only on the populated group page). Fix any
  WCAG 2.1 AA violations found (contrast, labels, keyboard focus).
- Keyboard-navigation sanity check on the core flow.
- **No** visual-regression snapshots (decision 3).

**Acceptance:** all four E2E projects green with axe assertions on group,
settings, and invite pages; documented in the PR.

---

## 3. Cross-cutting requirements

- **i18n (FR-10.4):** every new user-facing string exists in both `cs` and `en`
  catalogs (`packages/i18n/src/locales/*`). New strings: GDPR export/delete,
  activity action descriptions, FX auto/stale indicator. (Storage is not
  user-facing.)
- **Validation & access:** all new procedures use zod input schemas and
  `assertGroupAccess` where group-scoped.
- **Coverage:** keep `packages/core` ≥ 95%; cover all new `api` code with
  unit/integration tests. No live external calls in CI (fakes for S3, FX,
  OpenRouter).
- **Secrets:** storage keys and BYO keys never logged or returned to clients
  (existing invariant preserved).

## 4. Files touched (indicative)

- `apps/web/playwright.config.ts` (item 0)
- `packages/api/src/storage/object-store.ts` (new, item 1)
- `packages/api/src/context.ts`, `apps/web/src/app/api/trpc/[trpc]/route.ts`
  (inject `objectStore`, `fxFetch`)
- `packages/api/src/routers/ocr.ts` (items 1, 5)
- `packages/api/src/services/fx-provider.ts` (new), `services/fx-service.ts`,
  `routers/fx.ts`, `routers/transaction.ts` (item 2)
- `apps/web/src/components/add-expense-form.tsx` (item 2)
- `packages/api/src/routers/user.ts` (item 3)
- `apps/web/src/app/settings/page.tsx` (item 3)
- `packages/api/src/routers/activity.ts` (new), `root.ts`,
  `routers/{transaction,member,group}.ts` (item 4)
- `apps/web/src/components/group-detail.tsx` (item 4)
- `packages/api/src/rate-limit.ts` (new, item 5)
- `packages/i18n/src/locales/{cs,en}.ts` (items 3, 4, 2)
- `apps/web/src/server/env.ts`, `.env.example`, `docs/SELF_HOSTING.md` (items 1, 2)
- `packages/db/prisma/migrations/*` (optional index migration, item 4;
  cascade check, item 3)
- `apps/web/e2e/critical-flow.spec.ts` (+ helpers) for new E2E assertions

## 5. Definition of Done (per PRD §10.3)

For every item: implementation + unit/integration tests + relevant E2E written
and green; coverage gates pass; CZ + EN strings present for user-facing text;
a11y checks pass; `.env.example` / self-host docs updated where env changed.
