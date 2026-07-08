# Management dashboard + VIP (design spec)

> **Status:** approved design, ready to implement (staged)
> **Date:** 2026-07-08
> **Scope owner:** `packages/db` (schema), `packages/api` (trpc, admin router, ocr, error log), `apps/web` (auth bootstrap, `/admin` UI, header, settings), `packages/i18n`
> **Related:** [`docs/PRD.md`](../../PRD.md) §6 (OCR/BYO), §7.2 (user settings), FR-5.x · third of three workstreams (quick UI fixes ✓ · add-expense redesign ✓ · this)

## 1. Context, goal & product-direction note

Add an operator **management dashboard** for the hosted instance
(evenup.lnrtdev.cz): list users, view server errors (esp. OCR failures), set a
shared **instance OpenRouter key**, and grant **VIP** to selected users. VIP
unlocks OCR via the shared key **and** receipt-photo storage.

**Product-direction note:** the PRD says "no premium tiers" and "OpenRouter keys
are per-user BYO, not a global secret" (§584, NG2). This spec deliberately layers
an **operator-managed tier** on top for the hosted deployment, while **keeping
BYO working for everyone** (any user with their own key can still OCR). Approved
by the owner.

Verified current state (2026-07-08):

- `User` has `openRouterKeyEncrypted`, `ocrModel`; **no** `isAdmin`/`isVip`.
- `ocr.scan` (`packages/api/src/routers/ocr.ts`) requires the user's BYO key
  (else `PRECONDITION_FAILED`) and stores the receipt image best-effort gated by
  `RECEIPT_RETENTION_DAYS`.
- Auth is Better Auth (`apps/web/src/server/auth.ts`); `packageJson` declares
  `better-auth ^1.2.9` but pnpm resolves **1.6.20** (per the Apple spec). **The
  exact `databaseHooks` API will be read off the installed 1.6.20 source and
  verified via Context7 before implementing the bootstrap hook.**
- tRPC context `AuthUser` carries only `{ id, email }` (`packages/api/src/context.ts`).
- `trpc.ts` has `publicProcedure`/`protectedProcedure` and an `errorFormatter`.
- No instance-config table, no error-log table, no admin concept.

## 2. Data model (`packages/db/prisma/schema.prisma` + forward-only migration)

```prisma
model User {
  // …existing…
  isAdmin    Boolean   @default(false)
  isVip      Boolean   @default(false)
  disabledAt DateTime?               // soft-disable (blocks sign-in)
  errorLogs  ErrorLog[]
}

model InstanceConfig {
  id                     String   @id @default("singleton") // enforce single row
  openRouterKeyEncrypted String?  // shared instance key, AES-GCM at rest
  ocrModel               String?
  updatedAt              DateTime @updatedAt
}

model ErrorLog {
  id        String   @id @default(cuid())
  userId    String?
  user      User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  source    String   // first tRPC path segment, e.g. "ocr", "transaction"
  code      String?  // TRPCError code / status
  message   String   // includes cause message when present
  path      String?  // full procedure path, e.g. "ocr.scan"
  createdAt DateTime @default(now())

  @@index([createdAt])
  @@index([userId])
}
```

New migration `3_admin_vip` under `packages/db/prisma/migrations`. The
`InstanceConfig` singleton is created lazily by the API (`upsert` with fixed id).

## 3. Env & admin bootstrap

- Add `ADMIN_EMAILS` (comma-separated, optional) to `apps/web/src/server/env.ts`
  and `.env.example`, plus the Playwright webServer env for the E2E.
- **Bootstrap hook:** in `auth.ts`, via Better Auth `databaseHooks` on
  session/user create — after the signed-in email is known, if it is in
  `ADMIN_EMAILS` and the user's `isAdmin` is false, set it true. Idempotent;
  re-promotes on every sign-in so an admin can never be locked out. **Exact hook
  name/signature verified against installed better-auth 1.6.20 (Context7) at
  implementation.**
- **Disabled users:** the same hook layer rejects session creation when
  `user.disabledAt` is set; disabling a user also deletes their existing sessions
  (`session.deleteMany`) to force logout.

## 4. Backend (`packages/api`)

### 4.1 `adminProcedure` (`trpc.ts`)

`protectedProcedure` + middleware that loads `isAdmin` for `ctx.user.id`
(`prisma.user.findUnique … select:{ isAdmin, disabledAt }`) and throws
`FORBIDDEN` unless `isAdmin && !disabledAt`.

### 4.2 Error-logging middleware (`trpc.ts` + `services/error-log.ts`)

A middleware on the base procedure wraps `next()`:

```
try { return await next() }
catch (err) {
  void logError(prisma, { user, path, type, err }) // best-effort, never throws
  throw err
}
```

`logError` writes one `ErrorLog` row: `source = path.split('.')[0]`,
`path`, `code = err.code`, `message = err.message (+ cause?.message)`,
`userId = ctx.user?.id ?? null`. Covers all server + OCR failures in one place
(OCR errors carry `path = "ocr.scan"`). Wrapped in its own try/catch so logging
can never mask the original error.

### 4.3 `admin` router (new `routers/admin.ts`, registered in `root.ts`)

All `adminProcedure`:

| Procedure                    | Input                  | Behavior                                                                                                                                           |
| ---------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listUsers`                  | `{ limit?, cursor? }`  | id, email, name, isAdmin, isVip, disabledAt, `hasOwnKey` (openRouterKeyEncrypted != null), createdAt, group count. **Never** returns key material. |
| `setVip`                     | `{ userId, isVip }`    | update                                                                                                                                             |
| `setAdmin`                   | `{ userId, isAdmin }`  | update; **rejects if `userId === ctx.user.id`** (no self-demotion → no lockout)                                                                    |
| `setDisabled`                | `{ userId, disabled }` | set/clear `disabledAt`; on disable also delete that user's sessions; **rejects self**                                                              |
| `deleteUser`                 | `{ userId }`           | reuses a shared `deleteUserAccount(prisma, userId)` service (see §4.4); **rejects self**                                                           |
| `getInstanceConfig`          | —                      | `{ hasKey, ocrModel }` (never the key)                                                                                                             |
| `setInstanceOpenRouterKey`   | `{ apiKey }`           | `secretBox.encrypt` → upsert singleton                                                                                                             |
| `clearInstanceOpenRouterKey` | —                      | set null                                                                                                                                           |
| `setInstanceOcrModel`        | `{ model }`            | upsert singleton                                                                                                                                   |
| `listErrors`                 | `{ limit?, cursor? }`  | recent `ErrorLog` desc, joined with user email                                                                                                     |

### 4.4 Shared account deletion

Extract the GDPR deletion transaction currently inlined in
`user.deleteAccount` into `services/account.ts → deleteUserAccount(prisma, userId)`
(delete solo groups, unlink shared memberships, delete user; sessions/accounts
cascade). `user.deleteAccount` and `admin.deleteUser` both call it. No behavior
change to self-deletion; just reuse.

### 4.5 OCR key resolution & VIP photo gating (`routers/ocr.ts`)

Replace the "require BYO key" block with the approved cascade:

```
const user = … select { openRouterKeyEncrypted, ocrModel, isVip }
if (user.openRouterKeyEncrypted) { key = decrypt(user…); model = user.ocrModel ?? DEFAULT }
else if (user.isVip) {
  const cfg = instanceConfig.findUnique(singleton)
  if (!cfg?.openRouterKeyEncrypted) throw PRECONDITION_FAILED("No shared key configured; ask an admin.")
  key = decrypt(cfg…); model = user.ocrModel ?? cfg.ocrModel ?? DEFAULT
} else throw PRECONDITION_FAILED("Add your OpenRouter key in settings, or ask an admin for VIP access.")
```

Receipt-image storage block gains a `&& user.isVip` guard — non-VIP BYO users can
still OCR, but their receipt image is not stored. Everything else (rate limit,
FAILED receipt on error, retention) unchanged.

### 4.6 `user.me` extension

Add `isAdmin`, `isVip` to the `user.me` select/return (drives the header admin
link and a VIP badge in settings). Still never returns key material.

## 5. Dashboard UI (`apps/web`)

New client page `app/admin/page.tsx`, admin-gated (uses `user.me.isAdmin`; a
non-admin sees the existing not-found `Card`). Sections as `Card`s:

1. **Instance OpenRouter key** — set/clear the shared key + OCR model (mirrors the
   settings-page key UI, instance-level; `admin.getInstanceConfig` +
   set/clear/model).
2. **Users** — a responsive table (horizontal scroll on mobile): email · name ·
   **VIP** toggle · **Admin** toggle · **Disabled** toggle · has-own-key · joined
   · **Delete** (opens the `Modal` from WS2 for a typed confirm). Self row shows
   Admin/Disabled/Delete disabled.
3. **Errors** — recent `ErrorLog` rows: time · user · source · code · message ·
   path; "load more" via cursor.

Header (`components/header.tsx`): show a **"Správa"/Admin** link only when
`me.isAdmin`. Settings page: show a small **VIP** badge when `me.isVip`.

## 6. i18n

New `cs.ts`/`en.ts` keys under `nav.admin`, `admin.*` (section titles, column
headers, VIP/Admin/Disabled/Delete, confirm text), `admin.error.*`, `vip.badge`.
All added to both locales (parity enforced by the i18n test).

## 7. Testing

- **API (`packages/api` harness/integration):**
  - `adminProcedure`: non-admin → `FORBIDDEN`; admin passes.
  - OCR cascade: (a) BYO key present → uses it; (b) no BYO + VIP + instance key →
    uses shared, stores photo; (c) no BYO + VIP + no instance key →
    `PRECONDITION_FAILED`; (d) no BYO + non-VIP → `PRECONDITION_FAILED`; (e)
    non-VIP + BYO → OCR works, **no** stored photo.
  - `setAdmin`/`setDisabled`/`deleteUser` reject self.
  - error-log middleware writes exactly one row on a thrown procedure error.
- **E2E:** add `ADMIN_EMAILS` to the Playwright webServer env. An admin signs in,
  opens `/admin`, sees the users table, toggles VIP on a second user; a non-admin
  hitting `/admin` sees not-found. Axe check on `/admin`.

## 8. Staged implementation (same branch, verify each stage)

- **(a) Foundation** — schema + migration; `env.ADMIN_EMAILS`; bootstrap +
  disabled-session hooks (Context7-verified); `adminProcedure`; `user.me` +
  header link + settings VIP badge. Verify: typecheck, an admin can reach a
  stub `/admin`, a non-admin can't.
- **(b) Admin router + dashboard** — all endpoints (except delete/disable),
  Users + Instance-key + Errors sections. Verify: API tests + E2E VIP toggle.
- **(c) OCR / VIP gating** — §4.5. Verify: OCR cascade API tests + the existing
  OCR E2E still passes for BYO.
- **(d) Error log** — middleware + `listErrors` view. Verify: middleware test +
  errors show in dashboard.
- **(e) Delete / disable** — shared `deleteUserAccount`, `setDisabled`/`deleteUser`,
  disabled-sign-in block, confirm modal. Verify: API self-guard tests + manual.

## 9. Risks

- **Auth hook (Better Auth 1.6.20).** Bootstrap + disabled-block depend on the
  installed hook API — **verify via Context7 / source first** (mirrors the Apple
  spec's version caveat). Fallback if no suitable hook: reconcile `isAdmin` from
  `ADMIN_EMAILS` inside `createContext` on each request (one cached read).
- **Disabled ≠ instant global logout.** Deleting sessions on disable + rejecting
  new sessions covers it; document that a live in-flight request may still finish.
- **Key material.** Instance key encrypted with the same `SecretBox`; never
  returned to clients (only `hasKey`); never logged (error-log stores messages,
  not inputs).
- **Scale.** Large surface — mitigated by the staged plan; each stage is
  independently verifiable and shippable.

```

```
