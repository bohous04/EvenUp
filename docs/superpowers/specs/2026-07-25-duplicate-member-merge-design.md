# Duplicate members: prevention at invite time + merge as the cure

**Date:** 2026-07-25
**Status:** Approved (design)

## Problem

A person is invited to a group where a **virtual member already holds their
debts** ("Marek", unclaimed, owes 1 250 Kč). Instead of claiming that member,
they click **"I'm not on the list (Create a new user)"** and a second, empty
member appears. The debts stay stranded on the orphan placeholder, and the group
now has two "Mareks" — one with all the history and no account, one with an
account and no history.

This happens because `apps/web/src/app/invite/[token]/page.tsx` actively steers
people the wrong way:

1. **The visual hierarchy is inverted.** Claiming your own name is
   `variant="secondary"` (muted). "I'm not on the list (Create a new user)" is
   the default **primary** `<Button>`. The loudest control on the page is the
   one that strands the debt.
2. **The page never gives an instruction.** `t('invite.claim')` — _"Claim member
   profile"_ — is used as _both_ the page subtitle _and_ every row's button
   label. Nothing ever says "find your name below."
3. **The rows carry no signal.** A row is a chip + a name. Nothing indicates
   that this row is _you_ and that it holds 1 250 Kč of your debt.
4. **The escape hatch has no friction.** One click, no confirmation, and the
   result is effectively irreversible.
5. **There is no cure.** No merge exists anywhere in the API
   (`packages/api/src/routers/member.ts` has only add/list/update/remove/
   setBankDetail). Worse, `member.remove` _deactivates_ rather than deletes a
   member who appears in any transaction (FR-2.4), so every duplicate already
   created leaves its debt permanently stranded on an inactive placeholder.

Duplicates already exist in production, so this needs both halves: **prevention**
and **cure**.

## Goals

- An invitee who is already in the group picks their own name in the normal case,
  and cannot create a duplicate without a deliberate, informed confirmation.
- An admin — or the affected person — can fold an accidental duplicate back into
  the placeholder that holds the debts, without losing money or history.
- Group balances stay correct across a merge.

## Non-goals (YAGNI)

- **No schema migration.** Everything below runs on the existing tables.
- No merging _across_ groups, and no merging of `User` accounts — this is
  strictly `Member`-level, within one group.
- No undo for a merge. The confirmation dialog shows the arithmetic beforehand
  instead. (`logActivity` records it, so it is at least auditable.)
- No automatic merging. Detection only ever _suggests_; a human confirms.
- No change to how `member.remove` deactivates members.

---

# Part A — Prevention: the invite page

### A1. Flip the visual hierarchy

In `apps/web/src/app/invite/[token]/page.tsx`:

- Each unclaimed member becomes a **large, primary, full-width tap target**
  (chip + name + balance), not a row with a muted secondary button.
- `data-testid="invite-join-new"` demotes from a primary `<Button>` to a small
  **tertiary text link** below a divider.

`data-testid="invite-join-new"` is **kept** so the existing e2e selector still
resolves — its behaviour changes (see A4), not its identity.

### A2. Give the page a real instruction

`t('invite.claim')` currently does double duty. New i18n keys in both
`packages/i18n/src/locales/cs.ts` and `en.ts`:

| Key                      | Čeština                                                           | English                                                       |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `invite.pickYourName`    | Najdi se v seznamu                                                | Find your name below                                          |
| `invite.thisIsMe`        | To jsem já                                                        | This is me                                                    |
| `invite.notOnList`       | Nejsem v seznamu                                                  | I'm not on the list                                           |
| `invite.confirmNewTitle` | Opravdu tu nikdo z nich nejsi ty?                                 | Sure none of these is you?                                    |
| `invite.confirmNewBody`  | Když založíš nový účet, zůstanou dluhy přiřazené původnímu jménu. | Creating a new account leaves the debts on the original name. |
| `invite.confirmNewCta`   | Přesto založit nový účet                                          | Create a new account anyway                                   |
| `invite.confirmBack`     | Zpět k seznamu                                                    | Back to the list                                              |
| `invite.owes`            | dluží {amount}                                                    | owes {amount}                                                 |
| `invite.isOwed`          | má dostat {amount}                                                | is owed {amount}                                              |
| `invite.settled`         | vyrovnáno                                                         | settled up                                                    |

`{amount}` interpolation is supported — `translate.ts` replaces `/\{(\w+)\}/g`.
The existing `balance.owes` / `balance.isOwed` keys are deliberately _not_
reused: they interpolate `{debtor}`/`{creditor}`/`{member}`, whereas the invite
row already shows the name as its own label and needs the bare amount only.

The existing `invite.claim` and `invite.joinAsNew` keys stay (used by
`group-detail.tsx` / other call sites) — they are simply no longer used as the
invite page's subtitle and primary CTA.

### A3. Show each member's balance on their row — via a _new protected_ procedure

The balance is the strongest "this row is you" signal, but it must not leak.

**Decision:** `invite.preview` is a `publicProcedure`. Adding balances there
would expose who-owes-what in the group to anyone merely holding the token,
before signing in. So `preview` **stays exactly as it is** (name-only), and we
add:

```ts
// packages/api/src/routers/invite.ts
claimOptions: protectedProcedure
  .input(z.object({ token: z.string() }))
  .query(/* → { groupName, members: [{ id, displayName, initials, color, netMinorUnits, currency }] } */);
```

- Same token validity checks as `claim` (exists / not expired / under `maxUses`).
- Returns only `userId === null && isActive` members, matching `preview`.
- Balances come from `getGroupBalances(ctx.prisma, invite.groupId)` in
  `packages/api/src/services/balance-service.ts`, joined onto the member list.

There is no UX cost: the page already gates the member list behind sign-in
(`if (!session?.user)` renders `<SignIn>`), so the list is only ever rendered to
an authenticated caller. The public `preview` continues to serve the pre-sign-in
group-name display.

### A4. Confirmation on the escape hatch

Clicking "I'm not on the list" no longer mutates. It opens a dialog that
re-lists the unclaimed names **with their balances**, and offers
`invite.confirmBack` (primary) and `invite.confirmNewCta` (secondary/muted).
Only `invite.confirmNewCta` calls `claim.mutate({ token })`.

This is the "strong nudge": the new-account path stays available for a genuinely
new person, but is never reachable by reflex.

---

# Part B — Cure: `member.merge`

### B1. Direction

`merge({ sourceMemberId, targetMemberId })`

- **source** is absorbed and **deleted**.
- **target survives**, keeping the `displayName`, `initials`, `color` and
  history the group already recognises, and **inherits** source's `userId`
  (`target.userId ?? source.userId`).

In the common case source = the freshly-created duplicate, target = the
placeholder holding the debts. The newcomer's self-chosen display name is
discarded in favour of the name the group knows.

### B2. Authorization

- **Admin** (`assertGroupAdmin`) → may merge any two members of the group.
- **Non-admin** (`assertGroupAccess`) → only when
  `source.userId === ctx.user.id` **and** `target.userId === null`.

This grants no new privilege: `invite.claim` already lets any token-holder take
over any unclaimed member, debts included. Self-merge is the same power applied
after the fact, so it is bounded by the same trust.

### B3. Preflight — all checks before any write

1. Both members exist and share `groupId`; `source !== target`.
2. `CONFLICT` if `source.userId && target.userId && source.userId !== target.userId`
   — two real accounts must not be silently collapsed.
3. **Self-transfer check.** Any `Transaction` with `type: TRANSFER` whose
   `{fromMemberId, toMemberId}` is the pair in either order would become a
   payment from a person to themselves. Rather than destroy a money record we
   `PRECONDITION_FAILED` and **name the offending transactions** (id + title +
   date + amount) so the admin resolves them first.

   (The columns are `fromMemberId` / `toMemberId`; `TransferFrom` / `TransferTo`
   are only the Prisma _relation_ names.)

### B4. The merge — one `$transaction`, driven by the uniqueness constraints

| Table              | Constraint                            | On collision                                                                              |
| ------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `TransactionPayer` | `@@unique([transactionId, memberId])` | Sum `amountMinorUnits` into target's row, delete source's                                 |
| `TransactionSplit` | `@@unique([transactionId, memberId])` | Sum `computedMinorUnits`, `exactMinorUnits`, `shareWeight`, `percentage`; delete source's |
| `ItemAssignment`   | `@@id([receiptItemId, memberId])`     | Delete source's row (target already assigned)                                             |

No collision → simply repoint `memberId` to target.

**Null-handling on splits:** both rows belong to the _same_ transaction and
therefore share its `SplitType`, so the same nullable columns are populated on
both. Sum null-preservingly — `null` only when both sides are `null`, otherwise
treat the missing side as 0.

Also in the same transaction:

- `fromMemberId` / `toMemberId` repointed from source to target
  (self-transfers already excluded by B3).
- `BankDetail`: moved to target only if target has none; otherwise source's is
  dropped (`memberId` is `@unique`).
- `logActivity(prisma, groupId, userId, 'member.merged', { from, into })`.
- `delete` source.

### B5. Balance correctness — and its one honest limit

`loadBalanceTransactions` re-allocates each transaction's base total across its
payers and splits with `allocateByWeights`, whose largest-remainder ties break
by **row index** (the `{ id: 'asc' }` ordering is pinned deliberately — see the
comment in `balance-service.ts`).

Collapsing two rows into one changes the weight vector. Therefore:

- **Same-currency transactions:** `base === Σ weights`, so `safeAllocate` is the
  identity and the merge is **exactly** balance-preserving.
- **Cross-currency transactions:** the re-allocation is a genuine
  largest-remainder round, and merging two weights into their sum can move the
  result by **±1 minor unit** on that transaction.

Tests assert **exact** preservation for same-currency groups, and **zero-sum
always**. We do not claim exactness we cannot deliver.

### B6. `member.mergePreview`

A query backing the confirmation dialog — no irreversible money operation
without showing the arithmetic first. Returns: number of expenses/transfers
affected, the balance moving, the resulting target balance, and any blocking
self-transfers from B3 (so the dialog can explain a refusal rather than throwing
a raw error).

### B7. Detection — `member.duplicateCandidates`

Fires when a **claimed** member coexists with **unclaimed, active** placeholders
in the same group. Candidate pairs are ranked by name similarity; only pairs
above a conservative threshold surface in the banner.

Similarity must be **diacritic-folded and case-insensitive** — "Tomáš" /
"Tomas" / "tomas" are the same person to a Czech user. Compared against the
claimed member's `displayName`, and also the linked user's `name` and email
local-part, because `invite.claim` derives the duplicate's name from exactly
those two sources:

```ts
const derivedName = ctx.user.name?.trim() || ctx.user.email.split('@')[0] || 'Guest';
```

New helpers land in `packages/core/src/member/identity.ts` (pure, unit-tested,
shared with mobile): `normalizeForMatch(name)` and `nameSimilarity(a, b)`.

### B8. Merge UI

In `apps/web/src/components/group-detail.tsx`:

- **Banner** when `duplicateCandidates` returns a match: _"Marek Novák se
  přidal, ale 'Marek' je pořád nepřevzatý. Je to stejný člověk?"_ with
  **[Sloučit]** and **[Není]**.
- **"Není" dismisses to `localStorage`**, keyed by the member-pair ids. This
  keeps the change migration-free; the cost is that the banner returns on
  another device or browser. Accepted for v1.
- **Manual "Merge into…"** on every member row in the member list, for whatever
  detection misses.
- Both paths route through the same `mergePreview` → confirm dialog →
  `merge` sequence.

---

# Part C — Tests

### Integration (`packages/api/src/routers/`, existing vitest harness)

- Balances preserved exactly across a merge in a same-currency group; zero-sum
  preserved in a cross-currency group.
- Same-transaction collision sums payer amounts and split amounts correctly, and
  the transaction's splits still sum to its total.
- Self-transfer between the pair → `PRECONDITION_FAILED` naming the transaction.
- Both members claimed by different users → `CONFLICT`.
- Authorization matrix: admin merges any pair; non-admin self-merges into an
  unclaimed placeholder; non-admin is refused for a pair that isn't theirs, and
  refused when the target is already claimed.
- `ItemAssignment` collision de-duplicates rather than throwing.
- `BankDetail` moves only when target has none.
- Source member row is gone; target holds the `userId`.

### Core unit tests

- `normalizeForMatch` folds Czech diacritics and case.
- `nameSimilarity` scores "Marek"/"Marek Novák"/"marek" high, unrelated names low.

### E2E (`apps/web/e2e/critical-flow.spec.ts`)

- **Known breakage:** the test at line 653 clicks `invite-join-new` and expects
  to land on the dashboard. The A4 confirmation dialog breaks that by design —
  the test is updated to pass through the dialog. This is an intended change to
  an existing test, not a regression.
- New: picking your own name is the primary path and claims the placeholder,
  with its balance visible on the row.
- The existing a11y check over the invite page must still pass (§9.4): the
  dialog needs a proper role, focus trap and labelled controls.

---

## Files touched

| File                                        | Change                                                      |
| ------------------------------------------- | ----------------------------------------------------------- |
| `packages/db/prisma/schema.prisma`          | **none** — no migration                                     |
| `packages/core/src/member/identity.ts`      | `normalizeForMatch`, `nameSimilarity`                       |
| `packages/core/src/index.ts`                | export the two helpers                                      |
| `packages/api/src/routers/invite.ts`        | new `claimOptions` protected query                          |
| `packages/api/src/routers/member.ts`        | `merge`, `mergePreview`, `duplicateCandidates`              |
| `packages/api/src/services/activity.ts`     | **none** — `logActivity` takes a free-form `action: string` |
| `packages/i18n/src/locales/{cs,en}.ts`      | invite + merge + `activity.merged` keys                     |
| `apps/web/src/lib/activity-message.ts`      | `case 'member.merged'` in the action switch                 |
| `apps/web/src/components/activity-feed.tsx` | add `member.merged` to the filter list                      |
| `apps/web/src/app/invite/[token]/page.tsx`  | hierarchy, balances, confirm dialog                         |
| `apps/web/src/components/group-detail.tsx`  | banner + manual merge + confirm                             |
| tests                                       | as in Part C                                                |

`ActivityLog.action` is a plain `String` column and `logActivity(…, action: string, …)`
is untyped, so the server side needs no change to emit `member.merged`. The
_client_ is where the coupling lives: `activity-message.ts` switches on the
action string and `activity-feed.tsx` holds an explicit filter list. An action
the client doesn't know renders blank, so both must be updated.

## Rollout

Part A is small, self-contained and fixes the bleeding — it ships first. Part B
follows in the same branch. Neither requires a migration, so deployment is a
normal build.
