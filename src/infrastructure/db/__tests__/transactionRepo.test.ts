/**
 * src/infrastructure/db/__tests__/transactionRepo.test.ts
 *
 * Unit tests for TransactionRepo (CLA-24 / P1-03).
 *
 * Verifies:
 *   - add(): inserts a transaction; primary key is returned
 *   - getById(): retrieves by id; returns undefined for unknown id
 *   - getAll(): returns all stored transactions
 *   - update(): mutates specific fields; leaves others unchanged
 *   - delete(): removes a single record; no-op on missing id
 *   - clearAll(): empties the entire store
 *
 * TR-02: each test gets a fresh IDB factory to prevent state leakage.
 * TR-03: coverage ≥ 90 % for every branch in transactionRepo.ts.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { PaymentsDatabase, type TransactionEntry } from '../../database';
import { TransactionRepo } from '../../transactionRepo';
import { resetIDBFactory } from '../../../test/helpers/idb';

let idb!: ReturnType<typeof resetIDBFactory>;

beforeEach(() => {
  idb = resetIDBFactory();
});

function openDb(): { db: PaymentsDatabase; repo: TransactionRepo } {
  const db = new PaymentsDatabase(idb);
  const repo = new TransactionRepo(db);
  return { db, repo };
}

const baseTx: TransactionEntry = {
  id: 'tx-001',
  date: '2025-03-15',
  time: '09:00',
  amount: -99.5,
  purpose: 'Miete März',
  counterparty: 'Vermieter GmbH',
  category: 'rent',
  source: 'recurring',
  ruleId: 'rule-001',
};

describe('TransactionRepo (P1-03)', () => {
  describe('add()', () => {
    it('inserts a transaction and returns its id', async () => {
      const { db, repo } = openDb();
      await db.open();
      const key = await repo.add(baseTx);
      expect(key).toBe('tx-001');
      db.close();
    });

    it('inserted transaction is retrievable via getById()', async () => {
      const { db, repo } = openDb();
      await db.open();
      await repo.add(baseTx);
      const fetched = await repo.getById('tx-001');
      expect(fetched).toBeDefined();
      expect(fetched?.amount).toBe(-99.5);
      expect(fetched?.counterparty).toBe('Vermieter GmbH');
      db.close();
    });
  });

  describe('getById()', () => {
    it('returns undefined for an unknown id', async () => {
      const { db, repo } = openDb();
      await db.open();
      const result = await repo.getById('does-not-exist');
      expect(result).toBeUndefined();
      db.close();
    });
  });

  describe('getAll()', () => {
    it('returns an empty array when the store is empty', async () => {
      const { db, repo } = openDb();
      await db.open();
      const all = await repo.getAll();
      expect(all).toHaveLength(0);
      db.close();
    });

    it('returns all stored transactions', async () => {
      const { db, repo } = openDb();
      await db.open();

      const tx2: TransactionEntry = {
        ...baseTx,
        id: 'tx-002',
        date: '2025-04-01',
        amount: 3500,
        purpose: 'Gehalt April',
        source: 'manual',
      };

      await repo.add(baseTx);
      await repo.add(tx2);

      const all = await repo.getAll();
      expect(all).toHaveLength(2);
      const ids = all.map((t) => t.id);
      expect(ids).toContain('tx-001');
      expect(ids).toContain('tx-002');
      db.close();
    });
  });

  describe('update()', () => {
    it('updates specified fields and leaves others unchanged', async () => {
      const { db, repo } = openDb();
      await db.open();

      await repo.add(baseTx);
      await repo.update('tx-001', { amount: -120, purpose: 'Miete April' });

      const updated = await repo.getById('tx-001');
      expect(updated?.amount).toBe(-120);
      expect(updated?.purpose).toBe('Miete April');
      // unchanged fields must be preserved
      expect(updated?.counterparty).toBe('Vermieter GmbH');
      expect(updated?.category).toBe('rent');
      db.close();
    });

    it('resolves without error when updating a non-existent id', async () => {
      const { db, repo } = openDb();
      await db.open();
      // Dexie.update() is a no-op for unknown keys; should not throw
      await expect(repo.update('no-such-id', { amount: 0 })).resolves.toBeUndefined();
      db.close();
    });
  });

  describe('delete()', () => {
    it('removes an existing transaction', async () => {
      const { db, repo } = openDb();
      await db.open();

      await repo.add(baseTx);
      await repo.delete('tx-001');

      const result = await repo.getById('tx-001');
      expect(result).toBeUndefined();
      db.close();
    });

    it('is a no-op when the id does not exist', async () => {
      const { db, repo } = openDb();
      await db.open();
      // Should resolve without throwing
      await expect(repo.delete('ghost-id')).resolves.toBeUndefined();
      db.close();
    });
  });

  describe('clearAll()', () => {
    it('removes all transactions from the store', async () => {
      const { db, repo } = openDb();
      await db.open();

      await repo.add(baseTx);
      await repo.add({ ...baseTx, id: 'tx-002' });
      await repo.clearAll();

      const all = await repo.getAll();
      expect(all).toHaveLength(0);
      db.close();
    });

    it('resolves without error on an already-empty store', async () => {
      const { db, repo } = openDb();
      await db.open();
      await expect(repo.clearAll()).resolves.toBeUndefined();
      db.close();
    });
  });
});
