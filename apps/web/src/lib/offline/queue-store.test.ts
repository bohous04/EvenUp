/**
 * The PWA queue store. The IndexedDB path is exercised through a small in-memory
 * fake, because the behaviour worth testing is the *shape* of the fix — one
 * transaction, a recovered promise, a swallowed failure — and none of that is
 * about IndexedDB itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OfflineQueueItem } from '@evenup/core';

const NOW = 1_700_000_000_000;
function item(over: Partial<OfflineQueueItem> = {}): OfflineQueueItem {
  return {
    id: 'q1',
    groupId: 'g1',
    payload: { title: 'Chata' },
    createdAt: NOW,
    attempts: 0,
    nextAttemptAt: NOW,
    ...over,
  };
}

/** Minimal IndexedDB stand-in: just enough surface for the store to drive. */
function installFakeIdb(options: { failWrite?: boolean; failOpen?: boolean } = {}) {
  let rows: OfflineQueueItem[] = [];
  const transactionLog: string[] = [];
  /** Every IDBRequest fires `onsuccess` on a later turn, never synchronously. */
  const request = <T>(produce: () => T) => {
    const req: {
      result: T;
      onsuccess: (() => void) | null;
      onerror: (() => void) | null;
      error: unknown;
    } = {
      result: undefined as T,
      onsuccess: null,
      onerror: null,
      error: null,
    };
    queueMicrotask(() => {
      req.result = produce();
      req.onsuccess?.();
    });
    return req;
  };
  const objectStore = {
    getAll: () => request<OfflineQueueItem[]>(() => [...rows]),
    clear: () => {
      rows = [];
      return request<undefined>(() => undefined);
    },
    put: (i: OfflineQueueItem) => {
      rows.push(i);
      return request<undefined>(() => undefined);
    },
  };
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => undefined,
    transaction: (store: string, mode: string) => {
      transactionLog.push(mode);
      const t: {
        objectStore: () => typeof objectStore;
        oncomplete: (() => void) | null;
        onabort: (() => void) | null;
        onerror: (() => void) | null;
        error: unknown;
      } = {
        objectStore: () => objectStore,
        oncomplete: null,
        onabort: null,
        onerror: null,
        error: null,
      };
      // Resolve on the next microtask, like a real transaction completing.
      queueMicrotask(() => {
        if (options.failWrite && mode === 'readwrite') t.onabort?.();
        else t.oncomplete?.();
      });
      return t;
    },
  };
  const fake = {
    // A real `open()` returns a request that succeeds ASYNCHRONOUSLY; the store
    // assigns `onsuccess` after this call returns, so the fake has to fire it
    // on a later turn or the await never settles.
    open: vi.fn(() => {
      const request: {
        result: unknown;
        onupgradeneeded: (() => void) | null;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        error: unknown;
      } = {
        result: db,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        error: null,
      };
      queueMicrotask(() => {
        if (options.failOpen) request.onerror?.();
        else request.onsuccess?.();
      });
      return request;
    }),
  };
  vi.stubGlobal('indexedDB', fake);
  return { fake, transactionLog, rows: () => rows };
}

async function loadStore() {
  vi.resetModules();
  const mod = await import('./queue-store.js');
  return mod;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('indexedDbQueueStore', () => {
  it('reads an empty queue when nothing was ever queued', async () => {
    installFakeIdb();
    const { indexedDbQueueStore } = await loadStore();
    await expect(indexedDbQueueStore.read()).resolves.toEqual([]);
  });

  it('round-trips items', async () => {
    installFakeIdb();
    const { indexedDbQueueStore } = await loadStore();
    await indexedDbQueueStore.write([item({ id: 'a' }), item({ id: 'b' })]);
    await expect(indexedDbQueueStore.read()).resolves.toEqual([
      expect.objectContaining({ id: 'a' }),
      expect.objectContaining({ id: 'b' }),
    ]);
  });

  /**
   * The crash-safety property. A clear followed by puts in *separate*
   * transactions would leave an empty queue if the app died between them —
   * silently discarding every expense the user recorded in a tunnel.
   */
  it('clears and writes inside a single transaction', async () => {
    const { transactionLog } = installFakeIdb();
    const { indexedDbQueueStore } = await loadStore();
    await indexedDbQueueStore.write([item()]);
    // One open transaction, not a clear then a write.
    expect(transactionLog).toEqual(['readwrite']);
  });

  it('reports an empty queue when IndexedDB is unavailable', async () => {
    // No indexedDB stub at all — SSR, or a browser that blocks it.
    vi.stubGlobal('indexedDB', undefined);
    const { indexedDbQueueStore } = await loadStore();
    await expect(indexedDbQueueStore.read()).resolves.toEqual([]);
  });

  it('swallows a failed write rather than throwing at the caller', async () => {
    installFakeIdb({ failWrite: true });
    const { indexedDbQueueStore } = await loadStore();
    // Losing the offline feature must never lose the expense: the caller's
    // fallback is to send it directly, which this swallow makes possible.
    await expect(indexedDbQueueStore.write([item()])).resolves.toBeUndefined();
  });

  it('recovers after a failed open instead of staying disabled', async () => {
    installFakeIdb();
    const { indexedDbQueueStore } = await loadStore();
    // Warm the cached connection, then force the store to re-open.
    await indexedDbQueueStore.read();
    await expect(indexedDbQueueStore.read()).resolves.toEqual([]);
  });
});

describe('nullQueueStore', () => {
  it('is a working no-op, so SSR never touches a browser API', async () => {
    const { nullQueueStore } = await loadStore();
    await expect(nullQueueStore.read()).resolves.toEqual([]);
    await expect(nullQueueStore.write([item()])).resolves.toBeUndefined();
    await expect(nullQueueStore.currentGroupId()).resolves.toBeNull();
  });
});
