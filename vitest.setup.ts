/**
 * vitest.setup.ts – Global test setup for payments-generator
 *
 * TR-02: IndexedDB test strategy
 * ─────────────────────────────
 * Replaces the browser's native IndexedDB with fake-indexeddb so that
 * Dexie (and any raw IDB code) works in the Node / jsdom test environment
 * without a real browser.
 *
 * How it works:
 *   `fake-indexeddb/auto` installs a full, spec-compliant IDB implementation
 *   on `globalThis` (indexedDB, IDBKeyRange, IDBFactory, etc.) so that every
 *   test file and every import (including Dexie) picks up the mock
 *   automatically.
 *
 * Reset strategy (important for test isolation):
 *   Each test suite that touches the database should call
 *   `resetIDBFactory()` in a `beforeEach` hook (see the helper below).
 *   This returns a fresh IDBFactory instance, wiping all open databases and
 *   preventing state from leaking between tests.
 */

// ── Install global IDB mock ──────────────────────────────────────────────────

// `fake-indexeddb/auto` assigns the in-memory IDB implementation to
// globalThis.indexedDB, globalThis.IDBKeyRange, globalThis.IDBFactory, etc.
// This must run before any test file imports Dexie or uses IDB directly.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

// ── Helper: reset IDB between tests ─────────────────────────────────────────

/**
 * Returns a fresh `IDBFactory` instance and re-assigns it to
 * `globalThis.indexedDB`.  Call this in `beforeEach` for every test file
 * that opens an IndexedDB database so that each test starts with a clean
 * slate.
 *
 * Usage in a test file:
 * ```ts
 * import { resetIDBFactory } from '../test/helpers/idb';
 *
 * beforeEach(() => {
 *   resetIDBFactory();
 * });
 * ```
 */
export function resetIDBFactory(): IDBFactory {
  const fresh = new IDBFactory();
  // Re-assign so subsequent `globalThis.indexedDB.open()` calls use
  // the new, empty factory.
  globalThis.indexedDB = fresh;
  return fresh;
}
