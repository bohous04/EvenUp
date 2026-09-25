/**
 * The PWA's offline queue storage — IndexedDB.
 *
 * Implements the same `OfflineQueueStore` the Expo app implements over
 * AsyncStorage, so both clients drive the identical `drainQueue` from
 * `@evenup/core` and cannot drift into different battery behaviour.
 *
 * **Why IndexedDB and not localStorage.** The queue holds a `payload` that
 * includes `Date` values and nested split objects; localStorage would
 * serialise them to strings and back, losing the types on every read. It is
 * also synchronous and quota-capped at a few MB, which is the wrong shape for
 * "a user records expenses through a tunnel".
 *
 * Everything is **best-effort**: a private-mode browser or a full quota must
 * degrade to "no offline queue", never to a crash on the expense path. A
 * failure to *write* is swallowed and the expense is sent directly instead —
 * losing the offline feature is much better than losing the expense.
 */
import type { OfflineQueueItem, OfflineQueueStore } from '@evenup/core';

const DB_NAME = 'evenup-offline';
const DB_VERSION = 1;
const STORE = 'expense-queue';
/** The group the user is looking at, so a sync can be scoped without a round trip. */
const ACTIVE_KEY = 'active-group';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
  // A rejected promise must not be cached, or one failure disables the queue
  // for the rest of the session with no way to recover.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
        transaction.onabort = () => reject(transaction.error ?? new Error('transaction aborted'));
      }),
  );
}

/** LocalStorage is a fine place for one small string and is far more durable than nothing. */
function readActiveGroup(): string | null {
  try {
    return globalThis.localStorage?.getItem(ACTIVE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function setActiveOfflineGroup(groupId: string | null): void {
  try {
    if (groupId === null) globalThis.localStorage?.removeItem(ACTIVE_KEY);
    else globalThis.localStorage?.setItem(ACTIVE_KEY, groupId);
  } catch {
    // Storage disabled entirely: the queue still works, it just cannot be
    // scoped to a group by the host without asking.
  }
}

export const indexedDbQueueStore: OfflineQueueStore = {
  async read(): Promise<OfflineQueueItem[]> {
    try {
      const all = await tx<OfflineQueueItem[]>('readonly', (store) => store.getAll());
      return all.sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      // No IndexedDB (SSR, private mode, a blocked upgrade). "No queue" is the
      // honest answer, and the app falls back to sending directly.
      return [];
    }
  },

  async write(items: readonly OfflineQueueItem[]): Promise<void> {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        // Clear-then-write in ONE transaction: a crash between a clear and a
        // put would silently drop every queued expense.
        const transaction = db.transaction(STORE, 'readwrite');
        const objectStore = transaction.objectStore(STORE);
        objectStore.clear();
        for (const item of items) objectStore.put(item);
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new Error('queue write aborted'));
        transaction.onerror = () => reject(transaction.error ?? new Error('queue write failed'));
      });
    } catch {
      // Swallowed deliberately — see the module comment. The caller's fallback
      // is to send the expense immediately, which is worse for the user only
      // in the offline case this store does not support anyway.
    }
  },

  async currentGroupId(): Promise<string | null> {
    return readActiveGroup();
  },
};

/** A store that keeps nothing, for SSR and for browsers without IndexedDB. */
export const nullQueueStore: OfflineQueueStore = {
  async read() {
    return [];
  },
  async write() {
    /* nothing to persist */
  },
  async currentGroupId() {
    return null;
  },
};
