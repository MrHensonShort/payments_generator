/**
 * idb-mock.test.ts
 *
 * Demonstrates and verifies the fake-indexeddb mock setup (TR-02).
 *
 * This test file serves two purposes:
 *  1. Prove that fake-indexeddb is correctly wired to globalThis.indexedDB
 *     via vitest.setup.ts so that raw IDB code works in the Node environment.
 *  2. Document the canonical `beforeEach` reset pattern that all future
 *     DB test files (transactionRepo, ruleRepo, etc.) MUST follow.
 *
 * Every test file that opens an IndexedDB database should include:
 * ```ts
 * import { resetIDBFactory } from '../../../test/helpers/idb';
 * beforeEach(() => { resetIDBFactory(); });
 * ```
 */

import { resetIDBFactory } from '../../../test/helpers/idb';

// ── Reset IDB before every test (canonical pattern) ─────────────────────────
beforeEach(() => {
  resetIDBFactory();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Opens a database and returns the IDBDatabase handle. */
function openDatabase(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(name, version);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('items')) {
        db.createObjectStore('items', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
  });
}

/** Adds a record to an object store. */
function putRecord(
  db: IDBDatabase,
  storeName: string,
  record: { id: string; [key: string]: unknown },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Counts records in an object store. */
function countRecords(db: IDBDatabase, storeName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.count();
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('fake-indexeddb global mock (TR-02)', () => {
  it('globalThis.indexedDB is the fake-indexeddb implementation', () => {
    // The mock is injected by vitest.setup.ts before any test runs.
    expect(globalThis.indexedDB).toBeDefined();
    // fake-indexeddb implements IDBFactory – check that the expected methods exist.
    expect(typeof globalThis.indexedDB.open).toBe('function');
    expect(typeof globalThis.indexedDB.deleteDatabase).toBe('function');
  });

  it('can open a database and create an object store', async () => {
    const db = await openDatabase('test-db', 1);
    expect(db).toBeDefined();
    expect(db.objectStoreNames.contains('items')).toBe(true);
    db.close();
  });

  it('can write and read a record', async () => {
    const db = await openDatabase('test-db', 1);
    await putRecord(db, 'items', { id: 'item-1', value: 42 });

    const count = await countRecords(db, 'items');
    expect(count).toBe(1);
    db.close();
  });
});

describe('beforeEach reset isolates tests (TR-02)', () => {
  it('first test: writes a record', async () => {
    const db = await openDatabase('isolation-db', 1);
    await putRecord(db, 'items', { id: 'record-a' });

    const count = await countRecords(db, 'items');
    expect(count).toBe(1);
    db.close();
  });

  it('second test: starts with an empty database (reset by beforeEach)', async () => {
    // resetIDBFactory() was called between tests, so the DB written
    // in the previous test must NOT appear here.
    const db = await openDatabase('isolation-db', 1);
    const count = await countRecords(db, 'items');
    // Store is empty — proves the reset worked.
    expect(count).toBe(0);
    db.close();
  });
});
