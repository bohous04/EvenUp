import { describe, it, expect } from 'vitest';
import { fetchRate } from './fx-provider.js';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

describe('fetchRate (Frankfurter)', () => {
  it('requests from=quote&to=base for the day and returns the rate', async () => {
    let calledUrl = '';
    const rate = await fetchRate({
      baseCurrency: 'CZK',
      quoteCurrency: 'EUR',
      date: new Date('2026-06-22T10:00:00Z'),
      providerUrl: 'https://api.frankfurter.app',
      fetchImpl: async (url) => {
        calledUrl = url;
        return jsonResponse({ base: 'EUR', date: '2026-06-22', rates: { CZK: 24.7 } });
      },
    });
    expect(calledUrl).toBe('https://api.frankfurter.app/2026-06-22?from=EUR&to=CZK');
    expect(rate).toEqual({ rateDecimal: '24.7', source: 'frankfurter' });
  });

  it('returns null on a non-ok response', async () => {
    const rate = await fetchRate({
      baseCurrency: 'CZK',
      quoteCurrency: 'EUR',
      date: new Date('2026-06-22'),
      providerUrl: 'https://api.frankfurter.app',
      fetchImpl: async () => jsonResponse({}, false),
    });
    expect(rate).toBeNull();
  });

  it('returns null when the fetch throws', async () => {
    const rate = await fetchRate({
      baseCurrency: 'CZK',
      quoteCurrency: 'EUR',
      date: new Date('2026-06-22'),
      providerUrl: 'https://api.frankfurter.app',
      fetchImpl: async () => {
        throw new Error('network');
      },
    });
    expect(rate).toBeNull();
  });
});
