# Account profile settings — nickname + bank account for QR (design spec)

> **Status:** approved design, ready to implement
> **Date:** 2026-07-09
> **Scope owner:** `apps/web` (settings, group menu), `packages/api` (user, settlement routers), `packages/core` (CZ account → IBAN), `packages/db` (User field), `packages/i18n`
> **Related:** [`docs/PRD.md`](../../PRD.md) FR-7.x (SPAYD QR) · builds on the 2026-07-08 UI redesign.

## 1. Context & goal

Users want to manage two personal things **in Settings, once, for all groups**:

1. **Nickname** — editing it renames the account AND every group member linked
   to the account.
2. **Bank account for QR payments** — entered and displayed ONLY in the Czech
   format (`[prefix-]number/bankCode`, e.g. `19-2000145399/0800`). **IBAN never
   appears anywhere in the UI** (user decision 2026-07-09); the SPAYD standard
   requires IBAN inside the QR payload, so conversion happens internally at QR
   generation time.

Today: nickname is only per-group (pencil rename); IBAN is stored per group
member via the group menu's "IBAN" sheet. That per-group bank UI is removed.

## 2. Data model (`packages/db`)

Add to `User` (same pattern as `openRouterKeyEncrypted`):

```prisma
bankAccountEncrypted String? // CZ account "[prefix-]number/bankCode" as entered, AES-GCM at rest (§9.2)
```

- Stored exactly as the user typed it (normalized: trimmed, no spaces), encrypted
  with the existing AES-GCM util.
- The legacy per-member `BankDetail` table **stays untouched** as a read-only
  fallback so previously saved group IBANs keep working. **No data migration**
  (YAGNI — users set the account once in Settings; legacy rows age out).

## 3. Core: CZ account → IBAN (`packages/core`)

New pure module `src/bank/cz-account.ts`, exported from the package index:

- `parseCzAccount(input: string): { prefix: string; number: string; bankCode: string } | null`
  — accepts `PPPPPP-NNNNNNNNNN/KKKK` and `NNNNNNNNNN/KKKK`; trims/strips spaces;
  validates: prefix ≤ 6 digits, number 2–10 digits, bank code exactly 4 digits,
  and the Czech **mod-11 weighted checksums** (weights 6,3,7,9,10,5,8,4,2,1) on
  both prefix and number.
- `czAccountToIban(input: string): string | null` — builds
  `CZkk KKKK PPPPPP NNNNNNNNNN` (bank code + zero-padded prefix 6 + number 10)
  with IBAN mod-97 check digits; returns `null` for invalid input.
- `maskCzAccount(input: string): string` — display mask `…5399/0800` (last 4
  digits of the number + bank code).
- Unit tests with known vectors, including
  `19-2000145399/0800 → CZ6508000000192000145399` (matches the repo's existing
  e2e fixture) plus invalid-checksum, bad-bank-code, and format-noise cases.

## 4. API (`packages/api`)

### `user` router

- `updateProfile: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(50) }))`
  — updates `User.name`, then for **every linked member**
  (`member.userId === user.id`): sets `displayName`, re-derives `initials`
  (existing derivation used by `member.update`), and writes a `member.updated`
  activity entry into each affected group. One transaction.
- `setBankAccount: protectedProcedure.input(z.object({ account: z.string().trim().max(30) }))`
  — validates via `parseCzAccount` (tRPC `BAD_REQUEST` with a friendly message
  when invalid), stores normalized + encrypted.
- `clearBankAccount: protectedProcedure` — nulls the field.
- `me` additionally returns `bankAccountMasked: string | null` (decrypt +
  `maskCzAccount` server-side; the full value never reaches the client) and the
  current `name`.

### `settlement.generateSpayd`

Payee IBAN resolution order (replaces the single member lookup):

1. member's linked user's `bankAccountEncrypted` → decrypt → `czAccountToIban`;
   recipient name (`RN`) = the user's current `name`.
2. legacy `member.bankDetail.ibanEncrypted` (exactly as today, incl. its
   `recipientName`/`variableSymbol`).
3. neither → existing `PRECONDITION_FAILED` ("settle in cash") — unchanged UX.

`member.setBankDetail` stays in the API (mobile/back-compat) but is no longer
called from the web app; mark it `@deprecated` in a doc comment.

## 5. Web UI (`apps/web`)

### Settings page — new "Profile" card (first card on the page)

- **Nickname**: input pre-filled from `me.name`, Save button
  (`data-testid="profile-name-input"` / `profile-name-save`), saved indicator
  (existing Check pattern). Copy notes it renames the user in all their groups.
- **Bank account**: input with placeholder `19-2000145399/0800`
  (`data-testid="bank-account-input"` / `bank-account-save`), inline validation
  error for an invalid number, and when saved: masked value `…5399/0800`
  (`bank-account-masked`) + remove button (`bank-account-clear`). Copy explains
  it's used to generate QR payments in every group. The word "IBAN" appears
  nowhere.
- Both follow the redesign kit (Card, SectionLabel, Input, Button, AA contrast).

### Group page

- Remove the `bank` item from the ⋯ menu, the bank `Sheet`, and the
  `BankDetailsForm` component (web-only removal; `csv`/others unchanged; menu
  has 5 items after this).

## 6. i18n (`packages/i18n`, cs + en)

New keys (final wording per catalog tone): `profile.title`, `profile.nickname`,
`profile.nicknameHint` (renames you in all groups), `profile.bankAccount`,
`profile.bankAccountHint` (used for QR payments in all groups),
`profile.bankAccountInvalid`, `common.remove` (if missing). Removed with the
bank sheet: no keys deleted (`member.iban` may still be used by mobile).

## 7. Testing

- **core**: unit tests for `parseCzAccount` / `czAccountToIban` / `maskCzAccount`
  (valid vectors, checksum failures, prefix handling, padding).
- **api**: vitest for `updateProfile` linked-member rename + activity entries,
  `setBankAccount` validation/encryption round-trip, and `generateSpayd`
  resolution order (user-level beats legacy; legacy still works; neither →
  PRECONDITION_FAILED) — matching however the existing router tests are set up;
  if no router test rig exists, this coverage moves to e2e.
- **e2e** (`critical-flow.spec.ts`):
  - The exact-split/SPAYD test switches from the removed group bank sheet to
    Settings: fill `bank-account-input` with `19-2000145399/0800` → the settle
    sheet still shows `SPD*1.0*ACC:CZ6508000000192000145399`.
  - New: rename via Settings (`profile-name-input`) → group balances/members
    show the new name; a11y (axe) on the settings page stays green.
  - Group menu no longer shows `menu-bank`.

## 8. Out of scope

- Mobile app changes (it keeps whatever it uses today; APIs stay compatible).
- Data migration of legacy member `BankDetail` rows (fallback keeps them working).
- Foreign (non-CZ) account formats — CZ format only, per user decision.
- Variable symbol / message customization at user level.
