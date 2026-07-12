import { describe, expect, test, vi } from 'vitest';
import { extractReceipt, OcrError, type FetchLike } from './openrouter-adapter.js';

/** Build a fake `fetch` returning an OpenRouter-shaped chat completion. */
function fakeFetch(content: string, opts: { status?: number; usage?: unknown } = {}) {
  return vi.fn<FetchLike>(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content } }],
          usage: opts.usage ?? { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }),
        { status: opts.status ?? 200, headers: { 'content-type': 'application/json' } },
      ),
  );
}

const HAPPY = JSON.stringify({
  merchant: 'Albert',
  date: '2026-06-22',
  currency: 'CZK',
  items: [
    { name: 'Mléko', quantity: 1, unitPrice: 24.9, totalPrice: 24.9 },
    { name: 'Chléb', quantity: 2, unitPrice: 19.5, totalPrice: 39.0 },
  ],
  subtotal: 63.9,
  tax: null,
  tip: null,
  total: 63.9,
  confidence: 0.96,
});

const baseArgs = {
  pages: ['data:image/jpeg;base64,AAAA'],
  apiKey: 'sk-or-test',
  model: 'google/gemini-2.5-flash',
};

describe('extractReceipt — multi-page input', () => {
  test('sends one text part then one image_url part per page, no plugins', async () => {
    const fetchImpl = fakeFetch(HAPPY);
    await extractReceipt({
      ...baseArgs,
      pages: ['data:image/jpeg;base64,AAAA', 'data:image/png;base64,BBBB'],
      fetchImpl,
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    const content = body.messages[0].content;
    expect(content[0].type).toBe('text');
    expect(content.filter((c: { type: string }) => c.type === 'image_url')).toHaveLength(2);
    expect(body.plugins).toBeUndefined();
  });

  test('sends a PDF as a file part and enables the file-parser plugin', async () => {
    const fetchImpl = fakeFetch(HAPPY);
    await extractReceipt({
      ...baseArgs,
      pages: ['data:application/pdf;base64,JVBERi0='],
      fetchImpl,
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    const content = body.messages[0].content;
    expect(content.find((c: { type: string }) => c.type === 'file').file.file_data).toContain(
      'application/pdf',
    );
    expect(body.plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'pdf-text' } }]);
  });

  test('a mixed image + PDF page set sends both part types and enables the file-parser plugin', async () => {
    const fetchImpl = fakeFetch(HAPPY);
    await extractReceipt({
      ...baseArgs,
      pages: ['data:image/png;base64,AAAA', 'data:application/pdf;base64,JVBERi0='],
      fetchImpl,
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    const content = body.messages[0].content;
    expect(content.filter((c: { type: string }) => c.type === 'image_url')).toHaveLength(1);
    expect(content.filter((c: { type: string }) => c.type === 'file')).toHaveLength(1);
    expect(body.plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'pdf-text' } }]);
  });
});

describe('extractReceipt — happy path', () => {
  test('parses items into integer minor units in the detected currency', async () => {
    const fetchImpl = fakeFetch(HAPPY);
    const result = await extractReceipt({ ...baseArgs, fetchImpl });

    expect(result.currency).toBe('CZK');
    expect(result.merchant).toBe('Albert');
    expect(result.totalMinorUnits).toBe(6390);
    expect(result.items).toEqual([
      {
        name: 'Mléko',
        nameTranslated: null,
        quantity: 1,
        unitPriceMinorUnits: 2490,
        totalMinorUnits: 2490,
        taxRate: null,
      },
      {
        name: 'Chléb',
        nameTranslated: null,
        quantity: 2,
        unitPriceMinorUnits: 1950,
        totalMinorUnits: 3900,
        taxRate: null,
      },
    ]);
    expect(result.confidence).toBeCloseTo(0.96);
    expect(result.reconciliation.itemsSumMinorUnits).toBe(6390);
    expect(result.reconciliation.matchesTotal).toBe(true);
  });

  test('sends a strict json_schema response_format and the BYO key', async () => {
    const fetchImpl = fakeFetch(HAPPY);
    await extractReceipt({ ...baseArgs, fetchImpl });
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-or-test' });
  });

  test('flags a mismatch when items do not sum to the total', async () => {
    const mismatch = JSON.stringify({
      currency: 'CZK',
      items: [{ name: 'A', quantity: 1, totalPrice: 10 }],
      total: 25,
      confidence: 0.9,
    });
    const result = await extractReceipt({ ...baseArgs, fetchImpl: fakeFetch(mismatch) });
    expect(result.reconciliation.matchesTotal).toBe(false);
    expect(result.reconciliation.itemsSumMinorUnits).toBe(1000);
    expect(result.totalMinorUnits).toBe(2500);
  });

  test('reports low confidence', async () => {
    const lowConf = JSON.stringify({
      currency: 'CZK',
      items: [{ name: 'A', quantity: 1, totalPrice: 10 }],
      total: 10,
      confidence: 0.2,
    });
    const result = await extractReceipt({ ...baseArgs, fetchImpl: fakeFetch(lowConf) });
    expect(result.lowConfidence).toBe(true);
  });

  test('surfaces token usage from the response', async () => {
    const result = await extractReceipt({ ...baseArgs, fetchImpl: fakeFetch(HAPPY) });
    expect(result.usage?.total_tokens).toBe(150);
  });
});

describe('extractReceipt — robustness (§6.4)', () => {
  test('retries once on malformed JSON, then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: 'not json{' } }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: HAPPY } }] }), {
          status: 200,
        }),
      );
    const result = await extractReceipt({ ...baseArgs, fetchImpl });
    expect(result.totalMinorUnits).toBe(6390);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('throws OcrError after a second malformed response', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: 'bad' } }] }), {
          status: 200,
        }),
    );
    await expect(extractReceipt({ ...baseArgs, fetchImpl })).rejects.toBeInstanceOf(OcrError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('throws OcrError on an HTTP error status', async () => {
    const fetchImpl = vi.fn(async () => new Response('rate limited', { status: 429 }));
    await expect(extractReceipt({ ...baseArgs, fetchImpl })).rejects.toBeInstanceOf(OcrError);
  });

  test('throws OcrError when the schema does not validate', async () => {
    const invalid = JSON.stringify({ currency: 'CZK' }); // missing items/total/confidence
    const fetchImpl = fakeFetch(invalid);
    await expect(extractReceipt({ ...baseArgs, fetchImpl })).rejects.toBeInstanceOf(OcrError);
  });

  test('includes the response body in an HTTP error (for diagnosis)', async () => {
    const fetchImpl = vi.fn<FetchLike>(
      async () => new Response('upstream model error', { status: 502 }),
    );
    await expect(extractReceipt({ ...baseArgs, fetchImpl })).rejects.toThrow(
      /502.*upstream model error/,
    );
  });
});

describe('extractReceipt — item name translation', () => {
  test('threads a returned translated name into the item, keeping the original', async () => {
    const withTranslation = JSON.stringify({
      currency: 'EUR',
      items: [{ name: 'Milch', nameTranslated: 'Mléko', quantity: 1, totalPrice: 1.5 }],
      total: 1.5,
      confidence: 0.9,
    });
    const result = await extractReceipt({
      ...baseArgs,
      fetchImpl: fakeFetch(withTranslation),
      targetLang: 'cs',
    });
    expect(result.items[0]!.name).toBe('Milch');
    expect(result.items[0]!.nameTranslated).toBe('Mléko');
  });

  test('leaves nameTranslated null when the model omits it', async () => {
    const result = await extractReceipt({ ...baseArgs, fetchImpl: fakeFetch(HAPPY) });
    expect(result.items[0]!.nameTranslated).toBeNull();
  });

  test('asks the model to translate into the target language when given one', async () => {
    const fetchImpl = fakeFetch(HAPPY);
    await extractReceipt({ ...baseArgs, fetchImpl, targetLang: 'cs' });
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    const prompt = body.messages[0].content[0].text;
    expect(prompt).toMatch(/translate/i);
    expect(prompt).toMatch(/Czech/);
  });

  test('adds no translation instruction without a target language', async () => {
    const fetchImpl = fakeFetch(HAPPY);
    await extractReceipt({ ...baseArgs, fetchImpl });
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    const prompt = body.messages[0].content[0].text;
    expect(prompt).not.toMatch(/nameTranslated/);
  });
});

describe('extractReceipt — currency normalization (real models return symbols)', () => {
  const fixture = (currency: string) =>
    JSON.stringify({
      currency,
      items: [{ name: 'Rohlík', quantity: 1, totalPrice: 24.9 }],
      total: 24.9,
      confidence: 0.95,
    });

  test('maps "Kč" to CZK and parses minor units', async () => {
    const result = await extractReceipt({
      ...baseArgs,
      fetchImpl: fakeFetch(fixture('Kč')),
      fallbackCurrency: 'CZK',
    });
    expect(result.currency).toBe('CZK');
    expect(result.totalMinorUnits).toBe(2490);
  });

  test('maps common symbols (€, $, zł)', async () => {
    for (const [sym, iso] of [
      ['€', 'EUR'],
      ['$', 'USD'],
      ['zł', 'PLN'],
    ] as const) {
      const r = await extractReceipt({ ...baseArgs, fetchImpl: fakeFetch(fixture(sym)) });
      expect(r.currency).toBe(iso);
    }
  });

  test('keeps a valid ISO code as-is', async () => {
    const r = await extractReceipt({ ...baseArgs, fetchImpl: fakeFetch(fixture('usd')) });
    expect(r.currency).toBe('USD');
  });

  test('falls back to the provided currency for an unrecognized one', async () => {
    const r = await extractReceipt({
      ...baseArgs,
      fetchImpl: fakeFetch(fixture('???')),
      fallbackCurrency: 'EUR',
    });
    expect(r.currency).toBe('EUR');
  });
});

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

  test('accumulates two discounts that both fold onto the same item', async () => {
    const twoDiscounts = JSON.stringify({
      currency: 'CZK',
      items: [
        { name: 'Zboží', quantity: 1, totalPrice: 100 },
        { name: 'Sleva 1', quantity: 1, totalPrice: -10 },
        { name: 'Sleva 2', quantity: 1, totalPrice: -15 },
      ],
      total: 75,
      confidence: 0.95,
    });
    const result = await extractReceipt({ ...baseArgs, fetchImpl: fakeFetch(twoDiscounts) });

    expect(result.items.map((i) => [i.name, i.totalMinorUnits])).toEqual([['Zboží', 7500]]);
    expect(result.reconciliation.matchesTotal).toBe(true);
  });
});

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
