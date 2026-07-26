# Four UX fixes: invite guard, QR message, Czech settlement label, add-expense clarity

**Date:** 2026-07-26
**Status:** Approved (design)

Four independent, user-reported items. They share a spec because each is small
and none depends on another; they can be implemented and merged in any order.

1. Block claiming an invite when the user is already in the group.
2. Put a message for the recipient into the SPAYD QR payment.
3. Stop showing the English word "Settlement" in a Czech UI.
4. Make the add-expense sheet more intuitive — amount and title above all.

---

## 1 · Invite: a user already in the group cannot claim again

### Problem

`invite.claim` (`packages/api/src/routers/invite.ts:99`) never checks whether the
signed-in user **already has a member row in this group**. It only checks that
the *target* member isn't held by someone else:

```ts
if (target.userId && target.userId !== ctx.user.id) {
  throw new TRPCError({ code: 'CONFLICT', message: 'Member already claimed' });
}
```

So a person who is already in the group and opens the link again can:

- **claim a second, different member** — taking over someone else's identity and
  their balances, which the code above happily allows because that member is
  unclaimed; or
- **click "I'm not on the list"** and create a duplicate member for themselves —
  the exact failure [`2026-07-25-duplicate-member-merge`](./2026-07-25-duplicate-member-merge-design.md)
  set out to prevent, through a path that design did not close.

`claimOptions` has the same blind spot: it returns the pick-your-name list to
someone who has no business picking a name.

A secondary defect: re-claiming a member you already hold is currently *not*
idempotent. It falls through to `tx.member.update`, increments `usedCount`, and
writes a second `member.joined` activity entry.

### Design

**API — `packages/api/src/routers/invite.ts`**

Add one shared lookup, used by both procedures:

```ts
/** The viewer's own active member in this group, if any. */
function findOwnMembership(db, groupId: string, userId: string) {
  return db.member.findFirst({ where: { groupId, userId, isActive: true } });
}
```

`isActive: true` is deliberate — someone removed from the group (FR-2.4
deactivates rather than deletes) may legitimately rejoin through a fresh link.

- **`claimOptions`** additionally returns `groupId: string` and
  `alreadyMember: boolean`. A boolean is enough: the banner's name is resolved on
  the group page, which already has the data.
- **`claim`** runs the check inside the existing `$transaction`, before any
  write:
  - own membership exists **and** `input.memberId` is absent or points at a
    different member → `TRPCError({ code: 'CONFLICT' })`;
  - `input.memberId` **is** that membership → return it unchanged, without
    incrementing `usedCount` and without a second `logActivity` call. This makes
    a retried claim idempotent, which it is not today.

The server check is the actual protection and must not be removed in favour of
the redirect below — a direct API call bypasses the UI entirely.

**Web — `apps/web/src/app/invite/[token]/page.tsx`**

When `claimOptions` reports `alreadyMember`, redirect instead of rendering:

```ts
router.replace(`/groups/${options.data.groupId}?already=1`)
```

`replace`, not `push`, so Back doesn't bounce into the invite page again. The
redirect is evaluated before the member list renders, so the list never flashes.

**Web — group detail banner**

`apps/web/src/app/groups/[id]/page.tsx` is an async server component; it reads
`searchParams` and passes a boolean prop down to `GroupDetail`. This avoids
`useSearchParams()` in a client component, which would require a Suspense
boundary around the whole group detail for no benefit.

`GroupDetail` renders a new `AlreadyMemberBanner` next to the existing
`DuplicateBanner` (`apps/web/src/components/group-detail.tsx:191`), reusing its
amber `Card` styling. The member's name comes from `group.get`, whose `members`
already carry `userId`, matched against the session user — no extra query. If no
matching active member is found (the membership changed between the redirect and
the render), the banner renders nothing rather than a nameless sentence.

The banner has **no confirm button**, only a small `×` (aria-label
`common.cancel`, matching `sheet.tsx:146`). The point of this change is to remove
a click, not relocate it. Dismissing hides it locally and does
`router.replace('/groups/{id}')` to drop the query param; any other navigation
drops it too.

### i18n

| Key | cs | en |
| --- | --- | --- |
| `invite.alreadyMember` | `V téhle skupině už jsi jako {name}. Pozvánku nepotřebuješ.` | `You're already in this group as {name}. You don't need an invite.` |

---

## 2 · A message for the recipient in the QR payment

### Problem

The QR payment carries no message, so the recipient's bank statement shows a
bare transfer with no indication of what it settles.

Everything needed already exists and is simply not wired up:
`settlement.generateSpayd` accepts `message: z.string().max(60).optional()`
(`packages/api/src/routers/settlement.ts:21`), `buildSpayd` maps it to the SPAYD
`MSG:` attribute (`packages/core/src/spayd/spayd.ts`), and
`apps/web/src/components/settle-card.tsx:81` never passes it.

### Design

- New message key `settle.qrMessage`, interpolated with the group name.
- `SettleCard` takes a `groupName` prop. `group-detail.tsx` already holds
  `group.data.name` and passes it at the existing call site.
- `SettleRow` passes `message: t('settle.qrMessage', { group: groupName })` into
  the `generateSpayd` query.

SPAYD strips diacritics, so the real-world result is
`Vyrovnani dluhu Vikend na horach`. The 60-character cap leaves 44 characters for
the group name after the 16-character prefix; longer names are truncated by
`buildSpayd`, which is acceptable.

### Bundled fix: `sanitizeValue` can emit an invalid descriptor

`sanitizeValue` (`packages/core/src/spayd/spayd.ts`) percent-escapes first and
truncates afterwards:

```ts
return out.length > maxLength ? out.slice(0, maxLength) : out;
```

That slice can cut a three-character `%XX` sequence in half and produce a
malformed SPAYD string. NFD normalisation strips Czech diacritics before this
point, so ordinary Czech text never escapes — but a group name containing an
emoji, `*`, or `%` does.

This is a pre-existing latent bug, in scope because **this item is the first
feature to put user-controlled text into a SPAYD field**. Fix: truncate on escape
boundaries, never mid-sequence, with a unit test covering a name whose escape
straddles the limit.

### i18n

| Key | cs | en |
| --- | --- | --- |
| `settle.qrMessage` | `Vyrovnání dluhu {group}` | `Debt settlement {group}` |

---

## 3 · "Settlement" must not appear in a Czech UI

### Problem

This is **not** a missing translation. The English string is written into the
database as the transaction's title:

- `packages/api/src/routers/transaction.ts:230` (`recordTransfer`)
- `packages/api/src/routers/transaction.ts:395` (`updateTransfer`)

```ts
title: input.note ?? 'Settlement',
```

`apps/web/src/components/group-detail.tsx:226` then renders `{tx.title}` raw.
Because the string is persisted, fixing the code alone leaves every settlement
recorded so far still reading "Settlement".

`member-breakdown-sheet.tsx:144` is unaffected — it already prefers
`transferLabel` ("Anna → Bob") over the title.

### Design

Store **no title** for a settlement and localize at render time.

`Transaction.title` is `String` (non-nullable) in
`packages/db/prisma/schema.prisma:313`. Making it nullable would be a wider
migration for no gain, so the empty string is the "no custom note" marker. Only
transfers can reach it — the expense form marks the title `required`.

- Both call sites become `title: input.note ?? ''`.
- New message key `transaction.settlement`. The existing
  `balance.breakdown.settlement` (`vyrovnání`, lower-case) is mid-sentence prose
  and is not reusable as a title.
- Render-time fallback at three places:
  - `apps/web/src/components/group-detail.tsx:226` — the transaction row;
  - `apps/web/src/lib/activity-message.ts:35,37` — `transaction.updated` and
    `transaction.deleted`, which would otherwise log "edited " with an empty
    item;
  - `packages/api/src/routers/member.ts:207` — the merge-blocked error listing
    unresolved transfers. This one is server-side and uses `ctx.locale`, which
    `packages/api/src/context.ts:29` already provides.

The API keeps returning the empty title rather than a localized one, so the web
client stays free to switch locale without refetching.

There is no CSV **export** of transactions; `transaction.ts:532` is the CSV
*import* path and only creates `EXPENSE` rows, so it is unaffected.

### Data migration

Required — this is what fixes what users see today:

```sql
UPDATE "Transaction" SET title = '' WHERE type = 'TRANSFER' AND title = 'Settlement';
```

Scoped to `type = 'TRANSFER'` so an expense a user genuinely named "Settlement"
is left alone.

### i18n

| Key | cs | en |
| --- | --- | --- |
| `transaction.settlement` | `Vyrovnání` | `Settlement` |

---

## 4 · Add-expense: amount and title first

Scope confirmed with the user against browser mockups: **targeted fixes to the
existing sheet**, not a restructure into numbered sections and not a multi-step
wizard.

### Problem

In `apps/web/src/components/add-expense-form.tsx`:

1. **Neither the amount nor the title has a label.** Both rely on placeholders
   that vanish on first keystroke (lines 601–618, 668–677).
2. **The amount reads as detached from its currency.** The number is centred in a
   fixed `w-40` box; the currency select is `position: absolute; right: 0`
   (line 627). They do not read as one value.
3. **`w-40` is a hard 160 px.** A longer amount collides with the currency
   control.
4. **The title looks like a caption of the number** — a small, centred,
   underlined input — rather than a required field of its own.
5. **Both are `required` with nothing indicating it**; the error only arrives on
   submit.
6. **`t('expense.splitBetween')` labels two different things.** It is the heading
   over the member picker (line 723) *and* the label of the disclosure row whose
   value is the split *type* (line 779).
7. **The split-type control is collapsed below the members it governs**
   (lines 778–795), as are the per-member amount fields (lines 804–835).

### Design

**Amount block** — label `expense.amount` above the field; the flex row changes
from `items-end` + absolute positioning to `items-center` with a gap, so the
currency pill shares the number's optical centre. `w-40` and `position: absolute`
are dropped; the input sizes to its content.

The `items-center` detail was chosen explicitly over `items-baseline`: against
40 px digits, a baseline-aligned pill sits roughly 14 px low and reads as a
second line.

**Title** — becomes a full-width labelled `Input` with a visible
`expense.titleLabel` ("Za co?") and a required marker. `expense.title`
("Název") stays as-is; it is also used as a *default value* at line 442 for
itemized expenses, so it cannot be repurposed as the label.

**Split type** — the `Segmented` control moves out of the disclosure row to sit
directly above the member picker it governs, always visible.

**Per-member fields** (EXACT / SHARES / PERCENTAGE) move inline next to each
selected member's name, inside the "Rozdělit mezi" section. The
`per-member-inputs` and `member-value-{id}` test ids are preserved.

**Labels** — the disclosure row's duplicate label is replaced by a new
`expense.splitMethod` ("Jak rozdělit"); `expense.splitBetween` ("Rozdělit mezi")
stays with the member picker only.

**Unchanged** — the ITEMIZED editor keeps its position, and the Category / Date /
Repeat / Receipt disclosure rows are untouched.

### Test impact

Removing the `expense-split-row` disclosure retires that test id. Six call sites
across two specs are updated rather than propped up with a dead test id, since
the UI genuinely changed:

- `apps/web/e2e/critical-flow.spec.ts` — lines ~118, ~275, ~483–500 (including
  the `expense-split-row` enabled assertion at ~488 and the collapsed-state
  assertion at ~500, which no longer describes reality once the control is
  always visible).
- `apps/web/e2e/transaction-edit.spec.ts` — lines ~65, ~87, ~99.

### i18n

| Key | cs | en |
| --- | --- | --- |
| `expense.splitMethod` | `Jak rozdělit` | `How to split` |
| `expense.titleLabel` | `Za co?` | `What for?` |

---

## Testing

`packages/i18n/src/i18n.test.ts` asserts that every locale defines exactly the
same keys and that none is empty, so all six new keys must land in both `cs.ts`
and `en.ts`.

New coverage:

- **core** — `sanitizeValue` truncation never splits a `%XX` escape.
- **api / invite** — an existing member claiming a *different* member gets
  `CONFLICT`; claiming their own member is an idempotent no-op that does not
  increment `usedCount`; a deactivated ex-member can still rejoin;
  `claimOptions` reports `alreadyMember`.
- **api / transaction** — `recordTransfer` and `updateTransfer` persist `''`,
  not `'Settlement'`.
- **e2e** — the six call sites above, updated to the new layout.

Green baseline before any change: core 262, i18n 31, web 62, api 195, e2e 29
(chromium only — the config also declares firefox, webkit and mobile projects,
but only chromium is installed in this environment).

## Non-goals (YAGNI)

- No warning at invite-*creation* time. Invites are links, not addressed to a
  person, so there is nothing to check them against.
- No toast/notification system — the existing `DuplicateBanner` pattern covers
  the one banner this work needs.
- No `Transaction.title` schema change.
- No restructure of the add-expense sheet beyond the items listed above.
