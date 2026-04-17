/**
 * src/infrastructure/db/__tests__/ruleRepo.test.ts
 *
 * Unit tests for RuleRepo (CLA-24 / P1-03).
 *
 * Verifies:
 *   - add(): inserts a rule; primary key is returned
 *   - getById(): retrieves by id; returns undefined for unknown id
 *   - getAll(): returns all stored rules
 *   - update(): mutates specific fields; leaves others unchanged
 *   - delete(): removes a single record; no-op on missing id
 *   - clearAll(): empties the entire store
 *
 * TR-02: each test gets a fresh IDB factory to prevent state leakage.
 * TR-03: coverage ≥ 90 % for every branch in ruleRepo.ts.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { PaymentsDatabase, type RuleEntry } from '../../database';
import { RuleRepo } from '../../ruleRepo';
import { resetIDBFactory } from '../../../test/helpers/idb';

let idb!: ReturnType<typeof resetIDBFactory>;

beforeEach(() => {
  idb = resetIDBFactory();
});

function openDb(): { db: PaymentsDatabase; repo: RuleRepo } {
  const db = new PaymentsDatabase(idb);
  const repo = new RuleRepo(db);
  return { db, repo };
}

const baseRule: RuleEntry = {
  id: 'rule-001',
  type: 'recurring',
  name: 'Monatliche Miete',
  config: { amount: -850, day: 3, purpose: 'Warmmiete' },
  createdAt: '2025-01-01T00:00:00.000Z',
};

describe('RuleRepo (P1-03)', () => {
  describe('add()', () => {
    it('inserts a rule and returns its id', async () => {
      const { db, repo } = openDb();
      await db.open();
      const key = await repo.add(baseRule);
      expect(key).toBe('rule-001');
      db.close();
    });

    it('inserted rule is retrievable via getById()', async () => {
      const { db, repo } = openDb();
      await db.open();
      await repo.add(baseRule);
      const fetched = await repo.getById('rule-001');
      expect(fetched).toBeDefined();
      expect(fetched?.name).toBe('Monatliche Miete');
      expect(fetched?.type).toBe('recurring');
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

    it('returns all stored rules', async () => {
      const { db, repo } = openDb();
      await db.open();

      const rule2: RuleEntry = {
        id: 'rule-002',
        type: 'episode',
        name: 'Jahresurlaub',
        config: { totalAmount: -2000, spread: 14 },
        createdAt: '2025-02-01T00:00:00.000Z',
      };

      await repo.add(baseRule);
      await repo.add(rule2);

      const all = await repo.getAll();
      expect(all).toHaveLength(2);
      const ids = all.map((r) => r.id);
      expect(ids).toContain('rule-001');
      expect(ids).toContain('rule-002');
      db.close();
    });
  });

  describe('update()', () => {
    it('updates specified fields and leaves others unchanged', async () => {
      const { db, repo } = openDb();
      await db.open();

      await repo.add(baseRule);
      await repo.update('rule-001', { name: 'Kaltmiete', type: 'scatter' });

      const updated = await repo.getById('rule-001');
      expect(updated?.name).toBe('Kaltmiete');
      expect(updated?.type).toBe('scatter');
      // unchanged field must be preserved
      expect(updated?.createdAt).toBe('2025-01-01T00:00:00.000Z');
      db.close();
    });

    it('resolves without error when updating a non-existent id', async () => {
      const { db, repo } = openDb();
      await db.open();
      await expect(repo.update('no-such-id', { name: 'Ghost' })).resolves.toBeUndefined();
      db.close();
    });
  });

  describe('delete()', () => {
    it('removes an existing rule', async () => {
      const { db, repo } = openDb();
      await db.open();

      await repo.add(baseRule);
      await repo.delete('rule-001');

      const result = await repo.getById('rule-001');
      expect(result).toBeUndefined();
      db.close();
    });

    it('is a no-op when the id does not exist', async () => {
      const { db, repo } = openDb();
      await db.open();
      await expect(repo.delete('ghost-id')).resolves.toBeUndefined();
      db.close();
    });
  });

  describe('clearAll()', () => {
    it('removes all rules from the store', async () => {
      const { db, repo } = openDb();
      await db.open();

      await repo.add(baseRule);
      await repo.add({ ...baseRule, id: 'rule-002', type: 'scatter' });
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
