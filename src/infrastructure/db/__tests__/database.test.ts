/**
 * src/infrastructure/db/__tests__/database.test.ts
 *
 * Unit tests for database.ts (CLA-23 / P1-02).
 *
 * Verifies:
 *   - Dexie database opens without error
 *   - Schema version 1 is correctly migrated
 *   - All three stores (transactions, rules, appConfig) are defined with indexes
 *   - Basic CRUD operations work for each store
 *   - DB isolation between tests via resetIDBFactory (TR-02)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { PaymentsDatabase } from '../../database';
import { resetIDBFactory } from '../../../test/helpers/idb';

// Fresh IDB factory for each test - ensures proper isolation (TR-02)
let idb!: ReturnType<typeof resetIDBFactory>;

beforeEach(() => {
  idb = resetIDBFactory();
});

// Helper: open a fresh db instance per test
function openDb(): PaymentsDatabase {
  return new PaymentsDatabase(idb);
}

describe('PaymentsDatabase (P1-02)', () => {
  describe('database opens without error', () => {
    it('opens successfully and reaches version 1', async () => {
      const db = openDb();
      await db.open();
      expect(db.isOpen()).toBe(true);
      expect(db.verno).toBe(1);
      db.close();
    });
  });

  describe('schema version 1 - store definitions', () => {
    it('has transactions, rules and appConfig stores', async () => {
      const db = openDb();
      await db.open();
      const names = db.tables.map((t) => t.name);
      expect(names).toContain('transactions');
      expect(names).toContain('rules');
      expect(names).toContain('appConfig');
      db.close();
    });

    it('transactions store has expected indexes', async () => {
      const db = openDb();
      await db.open();
      const schema = db.table('transactions').schema;
      const indexNames = schema.indexes.map((i) => i.name);
      expect(indexNames).toContain('date');
      expect(indexNames).toContain('category');
      expect(indexNames).toContain('source');
      expect(indexNames).toContain('ruleId');
      db.close();
    });

    it('rules store has expected indexes', async () => {
      const db = openDb();
      await db.open();
      const schema = db.table('rules').schema;
      const indexNames = schema.indexes.map((i) => i.name);
      expect(indexNames).toContain('type');
      expect(indexNames).toContain('createdAt');
      db.close();
    });
  });

  describe('transactions store CRUD', () => {
    it('can add and retrieve a transaction', async () => {
      const db = openDb();
      await db.open();

      const tx = {
        id: 'tx-001',
        date: '2025-01-15',
        time: '10:30',
        amount: -42.5,
        purpose: 'Test payment',
        counterparty: 'Test Counterparty GmbH',
        category: 'living_costs',
        source: 'recurring' as const,
        ruleId: 'rule-001',
      };

      await db.transactions.add(tx);
      const fetched = await db.transactions.get('tx-001');
      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe('tx-001');
      expect(fetched?.date).toBe('2025-01-15');
      expect(fetched?.amount).toBe(-42.5);
      db.close();
    });

    it('can query transactions by date index', async () => {
      const db = openDb();
      await db.open();

      await db.transactions.bulkAdd([
        {
          id: 'tx-a',
          date: '2025-01-01',
          time: '09:00',
          amount: 100,
          purpose: 'A',
          counterparty: 'X',
          category: 'income',
          source: 'manual' as const,
        },
        {
          id: 'tx-b',
          date: '2025-01-15',
          time: '12:00',
          amount: -20,
          purpose: 'B',
          counterparty: 'Y',
          category: 'food',
          source: 'scatter' as const,
        },
        {
          id: 'tx-c',
          date: '2025-02-01',
          time: '08:00',
          amount: -50,
          purpose: 'C',
          counterparty: 'Z',
          category: 'rent',
          source: 'recurring' as const,
        },
      ]);

      const jan = await db.transactions
        .where('date')
        .between('2025-01-01', '2025-01-31', true, true)
        .toArray();
      expect(jan).toHaveLength(2);
      db.close();
    });

    it('can delete all transactions with clearAll pattern', async () => {
      const db = openDb();
      await db.open();

      await db.transactions.add({
        id: 'tx-x',
        date: '2025-01-01',
        time: '10:00',
        amount: 10,
        purpose: 'X',
        counterparty: 'X',
        category: 'misc',
        source: 'manual' as const,
      });
      await db.transactions.clear();
      const count = await db.transactions.count();
      expect(count).toBe(0);
      db.close();
    });
  });

  describe('rules store CRUD', () => {
    it('can add and retrieve a rule', async () => {
      const db = openDb();
      await db.open();

      const rule = {
        id: 'rule-001',
        type: 'recurring' as const,
        name: 'Monthly salary',
        config: { amount: 3500, day: 28, purpose: 'Gehalt' },
        createdAt: '2025-01-01T00:00:00.000Z',
      };

      await db.rules.add(rule);
      const fetched = await db.rules.get('rule-001');
      expect(fetched).toBeDefined();
      expect(fetched?.name).toBe('Monthly salary');
      expect(fetched?.type).toBe('recurring');
      db.close();
    });

    it('can query rules by type index', async () => {
      const db = openDb();
      await db.open();

      await db.rules.bulkAdd([
        {
          id: 'r1',
          type: 'recurring' as const,
          name: 'Salary',
          config: {},
          createdAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'r2',
          type: 'episode' as const,
          name: 'Bonus',
          config: {},
          createdAt: '2025-01-02T00:00:00.000Z',
        },
        {
          id: 'r3',
          type: 'recurring' as const,
          name: 'Rent',
          config: {},
          createdAt: '2025-01-03T00:00:00.000Z',
        },
      ]);

      const recurring = await db.rules.where('type').equals('recurring').toArray();
      expect(recurring).toHaveLength(2);
      db.close();
    });
  });

  describe('appConfig store (singleton pattern)', () => {
    it('can store and retrieve the singleton config', async () => {
      const db = openDb();
      await db.open();

      const config = {
        id: 1 as const,
        dateRangeStart: '2025-01-01',
        dateRangeEnd: '2025-12-31',
        paymentMode: 'sepa' as const,
        federalState: 'DE-BY',
        seed: 42,
      };

      await db.appConfig.put(config);
      const fetched = await db.appConfig.get(1);
      expect(fetched).toBeDefined();
      expect(fetched?.paymentMode).toBe('sepa');
      expect(fetched?.federalState).toBe('DE-BY');
      expect(fetched?.seed).toBe(42);
      db.close();
    });

    it('can update existing singleton config', async () => {
      const db = openDb();
      await db.open();

      await db.appConfig.put({
        id: 1 as const,
        dateRangeStart: '2025-01-01',
        dateRangeEnd: '2025-12-31',
        paymentMode: 'sepa' as const,
        federalState: 'DE-BY',
      });

      await db.appConfig.update(1, {
        paymentMode: 'instant',
      });

      const fetched = await db.appConfig.get(1);
      expect(fetched?.paymentMode).toBe('instant');
      db.close();
    });
  });

  describe('database isolation (TR-02)', () => {
    it('each test gets a fresh database via resetIDBFactory', async () => {
      const db = openDb();
      await db.open();
      await db.appConfig.put({
        id: 1 as const,
        dateRangeStart: '2020-01-01',
        dateRangeEnd: '2020-12-31',
        paymentMode: 'sepa' as const,
        federalState: 'DE-HH',
      });
      db.close();
      // resetIDBFactory in beforeEach will wipe this before the next test
    });

    it('previous test data is gone after reset', async () => {
      // idb is a FRESH factory from beforeEach - completely empty
      const db = openDb();
      await db.open();
      const count = await db.appConfig.count();
      expect(count).toBe(0);
      db.close();
    });
  });
});
