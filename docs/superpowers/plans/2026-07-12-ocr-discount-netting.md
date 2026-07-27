# OCR Discount Netting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a receipt has a per-item discount, OCR returns one item with the discount already subtracted from its price, instead of a separate negative "discount" line that blocks saving.

**Architecture:** Two layers, both in `packages/api/src/ocr/openrouter-adapter.ts`. (1) A prompt instruction tells the model to subtract a discount into the item it belongs to and not emit it as its own line. (2) A deterministic safety net in `normalize()` — a discount is recognised by a **negative price** — merges any leftover negative line into the immediately-preceding positive item, or drops it so the existing reconcile flow absorbs it. Neither layer touches the web UI; it just receives clean, positive items.

**Tech Stack:** TypeScript, zod, Vitest. Package `@evenup/api`.

## Global Constraints

- No new dependencies.
- Do not change the web UI (`apps/web/src/components/ocr-scan.tsx`, `itemized-editor.tsx`) or the wire/JSON schema (`packages/api/src/ocr/schema.ts`). `totalPrice` already permits negatives.
- Prices inside `normalize()` are integer **minor units**; a discount line has `totalMinorUnits < 0`.
- Whole-basket discounts baked into the printed `total` stay handled by the existing reconcile flow (out of scope).
- Tests hit no live API — use the `fakeFetch` helper already in `openrouter-adapter.test.ts`.
- Do not add a `Co-Authored-By` trailer to commits (user rule). We are on `main`; create a branch before the first commit.

---

### Task 0: Branch

- [ ] **Step 1: Create a working branch**

```bash
git checkout -b feat/ocr-discount-netting
```

---

### Task 1: Deterministic discount netting in `normalize()`

**Files:**

- Modify: `packages/api/src/ocr/openrouter-adapter.ts` (add `netDiscounts` helper; call it inside `normalize()` at the `const items = ...` assignment, currently lines 164-172)
- Test: `packages/api/src/ocr/openrouter-adapter.test.ts` (add a new `describe` block)

**Interfaces:**

- Consumes: the existing `OcrItem` interface (lines 57-66): `{ name, nameTranslated, quantity, unitPriceMinorUnits, totalMinorUnits, taxRate }`, all in minor units.
- Produces: a module-private `function netDiscounts(items: OcrItem[]): OcrItem[]`. Not exported — it is exercised end-to-end through `extractReceipt` + `fakeFetch`, matching the existing test style. Guarantees every returned item has `totalMinorUnits > 0` for any item it merged into (it never emits a negative item it created).

- [ ] **Step 1: Write the failing tests**

Append this block to `packages/api/src/ocr/openrouter-adapter.test.ts`:

```ts
describe('extractReceipt — discount netting', () => {
  test('nets a per-item discount into the immediately-preceding item', async () => {
    const withDiscount = JSON.stringify({
      currency: 'CZK',
      items: [
        { name: 'Rohlík', quantity: 1, unitPrice: 25, totalPrice: 25 },
        { name: 'Sleva', quantity: 1, totalPrice: -5 },
      ],
      total: 20,
      confidence: 0.95,
    });
    const result = await extractReceipt({ ...baseArgs, fetchImpl: fakeFetch(withDiscount) });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.name).toBe('Rohlík');
    expect(result.items[0]!.totalMinorUnits).toBe(2000);
    // unit price is stale once a discount is folded in — dropped to avoid showing a wrong figure
    expect(result.items[0]!.unitPriceMinorUnits).toBeNull();
    expect(result.reconciliation.itemsSumMinorUnits).toBe(2000);
    expect(result.reconciliation.matchesTotal).toBe(true);
  });

  test('nets a discount grouped after several items into its adjacent item', async () => {
    const grouped = JSON.stringify({
      currency: 'CZK',
      items: [
        { name: 'Mléko', quantity: 1, totalPrice: 30 },
        { name: 'Chléb', quantity: 1, totalPrice: 25 },
        { name: 'Sleva Chléb', quantity: 1, totalPrice: -5 },
      ],
      total: 50,
      confidence: 0.95,
    });
    const result = await extractReceipt({ ...baseArgs, fetchImpl: fakeFetch(grouped) });

    expect(result.items.map((i) => [i.name, i.totalMinorUnits])).toEqual([
      ['Mléko', 3000],
      ['Chléb', 2000],
    ]);
    expect(result.reconciliation.matchesTotal).toBe(true);
  });

  test('drops an orphan leading discount and lets reconcile absorb it — never leaks a negative item', async () => {
    const orphan = JSON.stringify({
      currency: 'CZK',
      items: [
        { name: 'Sleva', quantity: 1, totalPrice: -10 },
        { name: 'Zboží', quantity: 1, totalPrice: 100 },
      ],
      total: 90,
      confidence: 0.95,
    });
    const result = await extractReceipt({ ...baseArgs, fetchImpl: fakeFetch(orphan) });

    expect(result.items.map((i) => i.name)).toEqual(['Zboží']);
    expect(result.items.every((i) => i.totalMinorUnits > 0)).toBe(true);
    // items sum (10000) now exceeds the printed total (9000) → reconcile spreads the discount
    expect(result.reconciliation.itemsSumMinorUnits).toBe(10000);
    expect(result.reconciliation.matchesTotal).toBe(false);
  });

  test('a discount larger than its item is left to reconcile, not netted into a negative', async () => {
    const over = JSON.stringify({
      currency: 'CZK',
      items: [
        { name: 'A', quantity: 1, totalPrice: 20 },
        { name: 'BigSleva', quantity: 1, totalPrice: -25 },
        { name: 'B', quantity: 1, totalPrice: 100 },
      ],
      total: 95,
      confidence: 0.9,
    });
    const result = await extractReceipt({ ...baseArgs, fetchImpl: fakeFetch(over) });

    expect(result.items.map((i) => i.name)).toEqual(['A', 'B']);
    expect(result.items.every((i) => i.totalMinorUnits > 0)).toBe(true);
  });

  test('leaves a receipt with no discount untouched', async () => {
    const result = await extractReceipt({ ...baseArgs, fetchImpl: fakeFetch(HAPPY) });
    expect(result.items.map((i) => i.name)).toEqual(['Mléko', 'Chléb']);
    expect(result.items[0]!.totalMinorUnits).toBe(2490);
    expect(result.items[1]!.totalMinorUnits).toBe(3900);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd packages/api && pnpm vitest run src/ocr/openrouter-adapter.test.ts -t "discount netting"
```

Expected: FAIL — the first test gets 2 items (`Rohlík` and `Sleva` with `totalMinorUnits: -500`) instead of 1 netted item.

- [ ] **Step 3: Add the `netDiscounts` helper**

In `packages/api/src/ocr/openrouter-adapter.ts`, add this function immediately **above** `function normalize(` (currently line 162):

```ts
/**
 * Fold discount lines (a negative `totalMinorUnits`) into the item they apply to.
 * A discount is netted into the immediately-preceding positive item so the user
 * sees one item with the reduced price. A discount with no positive predecessor —
 * or one larger than that item — is dropped; the reconcile (item sum vs. printed
 * total) absorbs it, so the save is never blocked by a leftover negative line.
 */
function netDiscounts(items: OcrItem[]): OcrItem[] {
  const out: OcrItem[] = [];
  for (const it of items) {
    if (it.totalMinorUnits >= 0) {
      out.push(it);
      continue;
    }
    const prev = out[out.length - 1];
    if (prev && prev.totalMinorUnits + it.totalMinorUnits > 0) {
      out[out.length - 1] = {
        ...prev,
        totalMinorUnits: prev.totalMinorUnits + it.totalMinorUnits,
        unitPriceMinorUnits: null,
      };
    }
    // else: orphan / over-sized discount — drop it; reconcile absorbs the difference.
  }
  return out;
}
```

- [ ] **Step 4: Wire it into `normalize()`**

In `normalize()`, wrap the mapped items with `netDiscounts`. Change (currently lines 164-172):

```ts
const items: OcrItem[] = raw.items.map((it) => ({
  name: it.name,
  nameTranslated: it.nameTranslated ?? null,
  quantity: it.quantity,
  unitPriceMinorUnits:
    it.unitPrice === null || it.unitPrice === undefined ? null : toMinor(it.unitPrice, currency),
  totalMinorUnits: toMinor(it.totalPrice, currency),
  taxRate: it.taxRate ?? null,
}));
```

to:

```ts
const items: OcrItem[] = netDiscounts(
  raw.items.map((it) => ({
    name: it.name,
    nameTranslated: it.nameTranslated ?? null,
    quantity: it.quantity,
    unitPriceMinorUnits:
      it.unitPrice === null || it.unitPrice === undefined ? null : toMinor(it.unitPrice, currency),
    totalMinorUnits: toMinor(it.totalPrice, currency),
    taxRate: it.taxRate ?? null,
  })),
);
```

The existing `itemsSumMinorUnits` (line 174) and `matchesTotal` (line 192) then compute from the netted list automatically — no other change in `normalize()`.

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
cd packages/api && pnpm vitest run src/ocr/openrouter-adapter.test.ts
```

Expected: PASS — the new `discount netting` block passes and all pre-existing tests (happy path, mismatch, translation, currency, robustness) still pass.

- [ ] **Step 6: Typecheck**

Run:

```bash
cd packages/api && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/ocr/openrouter-adapter.ts packages/api/src/ocr/openrouter-adapter.test.ts
git commit -m "fix(ocr): net per-item discounts into their item instead of a separate negative line"
```

---

### Task 2: Prompt instruction to net discounts at the source

**Files:**

- Modify: `packages/api/src/ocr/openrouter-adapter.ts` (`BASE_PROMPT`, currently lines 111-119)
- Test: `packages/api/src/ocr/openrouter-adapter.test.ts` (add one test to the existing `describe('extractReceipt — item name translation')` block, or a small new block — it only inspects the outgoing prompt text)

**Interfaces:**

- Consumes: `buildPrompt(targetLang)` already assembles the outgoing prompt from `BASE_PROMPT`. The prompt text is retrievable in tests via `JSON.parse(init.body).messages[0].content[0].text` (see the existing translation tests, lines 231-248).
- Produces: no new symbol; `BASE_PROMPT` gains a discount instruction so every request carries it.

- [ ] **Step 1: Write the failing test**

Append this block to `packages/api/src/ocr/openrouter-adapter.test.ts`:

```ts
describe('extractReceipt — discount prompt', () => {
  test('instructs the model to subtract discounts into their item', async () => {
    const fetchImpl = fakeFetch(HAPPY);
    await extractReceipt({ ...baseArgs, fetchImpl });
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    const prompt = body.messages[0].content[0].text as string;
    expect(prompt).toMatch(/discount/i);
    expect(prompt).toMatch(/subtract/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd packages/api && pnpm vitest run src/ocr/openrouter-adapter.test.ts -t "discount prompt"
```

Expected: FAIL — the current `BASE_PROMPT` contains the word "discounts" once (in the total note) but no "subtract" instruction, so the `/subtract/i` assertion fails.

- [ ] **Step 3: Extend `BASE_PROMPT`**

In `packages/api/src/ocr/openrouter-adapter.ts`, append one clause to `BASE_PROMPT` (currently ending at line 119 with the "…grand total appears once." string). Add a new concatenated line before the final semicolon:

```ts
const BASE_PROMPT =
  'Extract the receipt as structured JSON. Czech receipts use comma decimals and "Kč". ' +
  'Return every line item with its name, quantity and total price. Amounts are major units (e.g. 24.90). ' +
  'The "currency" MUST be a 3-letter ISO 4217 code (e.g. CZK for Kč, EUR for €), never a symbol.' +
  ' Set "date" to the purchase date in ISO 8601 (YYYY-MM-DD) when the receipt shows one.' +
  ' Set "total" to the printed grand total; it need not equal the item sum (deposits, rounding, discounts).' +
  ' Classify the whole receipt into "category" — exactly one of: groceries, restaurant, transport,' +
  ' accommodation, entertainment, shopping, utilities, health, travel, other.' +
  ' The pages belong to ONE receipt (multiple screenshots or PDF pages) — combine them into a single receipt; do not duplicate items repeated in page headers/footers; the grand total appears once.' +
  ' When a line is a discount (a negative amount, e.g. "Sleva", "Rabatt", "discount"), subtract it from the' +
  ' total price of the specific item it applies to — even when the discount is listed lower down or grouped' +
  ' at the end of the receipt, match it to its item by name/context — and do NOT return the discount as its' +
  ' own line item. Only return a standalone negative item for a whole-receipt discount that cannot be' +
  ' attributed to a single item.';
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd packages/api && pnpm vitest run src/ocr/openrouter-adapter.test.ts -t "discount prompt"
```

Expected: PASS.

- [ ] **Step 5: Run the full OCR test file + typecheck**

Run:

```bash
cd packages/api && pnpm vitest run src/ocr/openrouter-adapter.test.ts && pnpm typecheck
```

Expected: all pass, no type errors. (The existing prompt tests at lines 231-248 still hold — they only assert translation clauses, which are unchanged.)

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/ocr/openrouter-adapter.ts packages/api/src/ocr/openrouter-adapter.test.ts
git commit -m "feat(ocr): tell the model to net receipt discounts into their item"
```

---

### Task 3: Full package verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole `@evenup/api` suite**

Run:

```bash
cd packages/api && pnpm test
```

Expected: all tests pass.

- [ ] **Step 2: Lint the package**

Run:

```bash
cd packages/api && pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Manual reasoning check against the spec**

Confirm each spec scenario is covered by a passing test in `openrouter-adapter.test.ts`:

- product + adjacent discount → one netted item ✓ (Task 1, test 1)
- discount grouped after products, adjacent to one → nets into preceding ✓ (Task 1, test 2)
- orphan leading discount → dropped, folded into reconcile, no negative leaks ✓ (Task 1, test 3)
- over-sized discount → no negative item leaks ✓ (Task 1, test 4)
- no discount → unchanged ✓ (Task 1, test 5)
- prompt carries the discount instruction ✓ (Task 2)

If any is unclear from the output, re-run that single test with `-t`.

---

## Self-Review

**1. Spec coverage:** Every spec section maps to a task — Layer 1 (prompt) → Task 2; Layer 2 (deterministic netting: adjacent-merge + orphan-to-reconcile) → Task 1; "no UI change" honored (only `openrouter-adapter.ts` touched); testing section → the five netting tests + the prompt test + Task 3. No gaps.

**2. Placeholder scan:** No TBD/TODO/"handle edge cases" — every step shows the exact code or command.

**3. Type consistency:** `netDiscounts(items: OcrItem[]): OcrItem[]` uses the existing `OcrItem` fields (`totalMinorUnits`, `unitPriceMinorUnits`) verbatim; `normalize()` keeps its existing `itemsSumMinorUnits` / `matchesTotal` names. `BASE_PROMPT` stays a single `const` string. No signature drift.
