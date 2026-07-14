# Member balance breakdown sheet

**Date:** 2026-07-14
**Status:** Approved (design)

## Problem

The Zůstatky (Balances) card shows one bar + amount per member, but there's no
way to see *why* a person's balance is what it is. The user wants to tap a
person in Zůstatky and see the transactions "written on their name" — what they
paid, what they owe (their share), and, for OCR receipts, the individual
položky (line-items) assigned to them.

## Goal

Tapping a member in `BalancesCard` opens a read-only sheet that fully explains
that member's balance: a summary of their spend, and a filterable ledger of
every paid/owed entry that sums exactly to the balance shown on the card.

## Non-goals (YAGNI)

- Editing anything from the sheet — it is read-only. (A future iteration may
  deep-link a row to the expense editor; not now. Rows are inert.)
- Cross-currency niceties for the item drill-in: item amounts are shown in the
  receipt's own currency; the row's share total is the base-currency amount.
- Charts / visualizations — the existing SpendStats panel already covers that.

## User-facing design

### Entry point

Each member row in `apps/web/src/components/balances-card.tsx` becomes a tap
target: the existing chip + name + bar + amount is wrapped in a `<button>` that
opens a `Sheet`. The bars stay visually unchanged. `BalancesCard` gains local
state for the selected member (or lifts it to a small internal sub-component so
`group-detail.tsx` stays untouched).

The sheet reuses the app's existing `Sheet` component (same pattern as
Members / Stats / Activity panels), titled with the member's display name.

### Summary header (three stats)

At the top of the sheet, a compact 3-stat row:

| Stat | Meaning | Scope |
|---|---|---|
| **Útrata** (spent) | Σ of the member's **shares of EXPENSE** transactions — what the things they consumed cost them | expenses only; excludes transfers/settlements |
| **Zaplaceno** (paid) | Σ of what the member **paid out** on expenses | expenses only |
| **Zůstatek** (balance) | paid − owed across **all** transactions incl. transfers | matches the Zůstatky bar exactly |

> **Decided:** "total spent money" is read as **Útrata** (the member's expense
> share / real consumption), excluding settlements. Both Útrata and Zaplaceno
> are shown, so the out-of-pocket number is available too.

### Ledger list

Below the header, a flat, date-sorted (newest first) list. Each transaction
contributes up to two rows:

- a green **`+ zaplatila`** row for every expense/transfer the member **paid**
  (one per `TransactionPayer` where `memberId` = the member), and
- a red **`− podíl`** row for every **share** the member owes (one per
  `TransactionSplit` where `memberId` = the member).

Rows always sum to **Zůstatek**.

**Filter chips** at the top of the list use gender-neutral labels:
**`Vše` / `Zaplaceno` / `Podíl`** (default `Vše`). The per-row labels can still
read as the concrete verb (`+ zaplatila` / `− podíl` in the examples); the chips
are controls, so they stay neutral. Filtering never changes the summary totals.

**Transfers/settlements** render with a transfer label (e.g. `Anna → Bob
(vyrovnání)`): a `+` paid row for the sender, a `−` row for the recipient.

### Itemized drill-in (položky)

A `− podíl` row whose transaction is **itemized** (`splitType: ITEMIZED`, i.e.
has `receiptItems`) gets a chevron. Expanding it lists the `ReceiptItem`s
assigned to that member:

- Each assigned item shows `quantity ×? name` and the member's **portion** of
  it: `totalMinorUnits ÷ (number of assignees)` (a shared item is split across
  its assignees).
- A reconciling **`(společné — DPH, zaokrouhlení, nepřiřazené)`** line holds the
  difference between the summed item portions and the row's authoritative share
  total, so the drill-in always sums to the row.

Non-itemized `− podíl` rows have no chevron. `+ zaplatila` rows never expand.

## Data / API

New read-only tRPC procedure on the balance router:

```
balance.memberBreakdown({ groupId, memberId }) → MemberBreakdown
```

Guarded by `assertGroupAccess`. `memberId` must belong to `groupId` (reuse the
membership check pattern; 404/400 otherwise).

Backed by a new `getMemberBreakdown(prisma, groupId, memberId)` service in
`packages/api/src/services/balance-service.ts`. It **reuses the same
base-currency re-allocation** (`safeAllocate` over each transaction's
`baseMinorUnits`) that `getGroupBalances` / `loadBalanceTransactions` already
use, so the entries are provably consistent with the balance on the card.

Return shape (amounts are base-currency minor units unless noted):

```ts
interface MemberBreakdown {
  memberId: string;
  displayName: string;
  balanceMinorUnits: number; // == Zůstatek, matches BalancesCard
  spentMinorUnits: number;   // Útrata — Σ EXPENSE share entries
  paidMinorUnits: number;    // Zaplaceno — Σ EXPENSE paid entries
  entries: BreakdownEntry[]; // newest first
}

interface BreakdownEntry {
  txId: string;
  title: string;
  date: string;            // ISO
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  kind: 'paid' | 'share';
  amountMinorUnits: number; // base; signed for display (+ paid / − share)
  transferLabel?: string;   // "Anna → Bob" for transfers
  // present only for itemized `share` entries:
  items?: {
    name: string;
    quantity: number;
    portionMinorUnits: number; // this member's portion, receipt currency
  }[];
  remainderMinorUnits?: number; // reconciliation line, receipt currency
  currency?: string;            // receipt currency for the item breakdown
}
```

Notes:
- Item source: `ReceiptItem` (`name`, `quantity`, `totalMinorUnits`,
  `assignments[].memberId`). Portion = `totalMinorUnits / assignees.length`
  for items where `assignments` includes this member.
- The item breakdown is illustrative; the `share` entry's `amountMinorUnits`
  (base, re-allocated) is authoritative, hence the reconciliation remainder.

## Testing

**Service unit tests** (`balance-service` / core):
- Entries sum to `balanceMinorUnits` for a mixed group (equal, shares,
  itemized, transfer).
- `spentMinorUnits` excludes transfers; equals Σ of EXPENSE share entries.
- For an itemized share entry, Σ item portions + remainder == entry amount
  (in the same currency basis).
- Shared item (assigned to 2 members) contributes half its total to each.

**E2E** (`apps/web/e2e`):
- Open a group → tap a member row in Zůstatky → sheet opens with the summary
  header and a ledger.
- Filter chips narrow the visible rows (`+ zaplatila` hides share rows, etc.).
- Expanding an itemized `− podíl` row reveals the assigned položky.
- The `Zůstatek` stat matches that member's amount on the Zůstatky card.

## i18n

New keys in `packages/i18n/src/locales/{cs,en}.ts` for: sheet title pattern,
`Útrata` / `Zaplaceno` / `Zůstatek` stat labels, filter chips (`Vše` /
`Zaplaceno` / `Podíl`), the per-row paid/share labels, the transfer label, and
the `(společné …)` remainder line.
```
