/**
 * src/infrastructure/__tests__/BackupService.test.ts
 *
 * Unit tests for BackupService (P5-06 / CLA-68).
 *
 * Covers:
 *   TX-RTO  Transaction export → import roundtrip (lossless)
 *   TX-MRG  Merge: only new transactions are added, duplicates skipped
 *   TX-REP  Replace: clears store, inserts all imported records
 *   TX-SCH  Schema validation: unknown fields collected in errors[]
 *   TX-50M  50-MB size limit throws BackupError('FILE_TOO_LARGE')
 *   RU-RTO  Rules export → import roundtrip
 *   RU-MRG  Rules merge deduplication
 *   RU-REP  Rules replace
 *   RU-CFG  Optional AppConfig export/import
 *   ERR     Invalid JSON, wrong envelope type
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  PaymentsDatabase,
  type AppConfigEntry,
  type RuleEntry,
  type TransactionEntry,
} from '../database.js';
import { resetIDBFactory } from '../../test/helpers/idb.js';
import { BackupService, BackupError, MAX_IMPORT_BYTES } from '../BackupService.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

let idb!: ReturnType<typeof resetIDBFactory>;

beforeEach(() => {
  idb = resetIDBFactory();
});

function openDb(): { db: PaymentsDatabase; svc: BackupService } {
  const db = new PaymentsDatabase(idb);
  const svc = new BackupService(db);
  return { db, svc };
}

const makeTx = (overrides: Partial<TransactionEntry> = {}): TransactionEntry => ({
  id: 'tx-001',
  date: '2025-03-15',
  time: '09:00',
  amount: -99.5,
  purpose: 'Miete März',
  counterparty: 'Vermieter GmbH',
  category: 'Miete',
  source: 'recurring',
  ruleId: 'rule-001',
  ...overrides,
});

const makeRule = (overrides: Partial<RuleEntry> = {}): RuleEntry => ({
  id: 'rule-001',
  type: 'recurring',
  name: 'Monatsmiete',
  config: { dayOfMonth: 1, cycle: 'monthly' },
  createdAt: '2025-01-01T00:00:00.000Z',
  ...overrides,
});

const APP_CFG: AppConfigEntry = {
  id: 1,
  dateRangeStart: '2025-01-01',
  dateRangeEnd: '2025-12-31',
  paymentMode: 'sepa',
  federalState: 'DE-BY',
};

// ── Transaction tests ─────────────────────────────────────────────────────────

describe('exportTransactions()', () => {
  it('returns valid JSON with envelope metadata', async () => {
    const { svc } = openDb();
    const json = await svc.exportTransactions();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.type).toBe('transactions');
    expect(typeof parsed.exportedAt).toBe('string');
    expect(Array.isArray(parsed.transactions)).toBe(true);
  });

  it('includes all stored transactions', async () => {
    const { db, svc } = openDb();
    const txs = [makeTx({ id: 'tx-001' }), makeTx({ id: 'tx-002' })];
    await db.transactions.bulkAdd(txs);

    const json = await svc.exportTransactions();
    const parsed = JSON.parse(json);
    expect(parsed.transactions).toHaveLength(2);
  });

  it('exports empty array when no transactions exist', async () => {
    const { svc } = openDb();
    const json = await svc.exportTransactions();
    expect(JSON.parse(json).transactions).toHaveLength(0);
  });
});

describe('TX-RTO: transaction roundtrip', () => {
  it('import after export yields identical records', async () => {
    const { db, svc } = openDb();
    const txs = [
      makeTx({ id: 'tx-001', amount: -800, category: 'Miete' }),
      makeTx({
        id: 'tx-002',
        amount: 2500,
        category: 'Gehalt',
        source: 'manual',
        ruleId: undefined,
      }),
    ];
    await db.transactions.bulkAdd(txs);

    const json = await svc.exportTransactions();

    // Clear and re-import
    await db.transactions.clear();
    const result = await svc.importTransactions(json, 'replace');

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    const restored = await db.transactions.toArray();
    expect(restored).toHaveLength(2);
    expect(restored.find((t) => t.id === 'tx-001')?.amount).toBe(-800);
    expect(restored.find((t) => t.id === 'tx-002')?.ruleId).toBeUndefined();
  });
});

describe('TX-MRG: merge mode', () => {
  it('adds only transactions with new ids', async () => {
    const { db, svc } = openDb();
    await db.transactions.add(makeTx({ id: 'tx-001' }));

    // Build import JSON directly to avoid sharing IDB between two PaymentsDatabase instances
    const json = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      type: 'transactions',
      transactions: [makeTx({ id: 'tx-001' }), makeTx({ id: 'tx-002' })],
    });

    const result = await svc.importTransactions(json, 'merge');
    expect(result.imported).toBe(1); // only tx-002
    expect(result.skipped).toBe(1); // tx-001 already exists

    const all = await db.transactions.toArray();
    expect(all).toHaveLength(2);
  });

  it('imports everything when store is empty', async () => {
    const { svc, db } = openDb();
    const json = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      type: 'transactions',
      transactions: [makeTx({ id: 'tx-A' }), makeTx({ id: 'tx-B' })],
    });

    const result = await svc.importTransactions(json, 'merge');
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(await db.transactions.count()).toBe(2);
  });
});

describe('TX-REP: replace mode', () => {
  it('removes all existing records and inserts imported ones', async () => {
    const { db, svc } = openDb();
    await db.transactions.bulkAdd([makeTx({ id: 'old-1' }), makeTx({ id: 'old-2' })]);

    const json = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      type: 'transactions',
      transactions: [makeTx({ id: 'new-1' })],
    });

    const result = await svc.importTransactions(json, 'replace');
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);

    const all = await db.transactions.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('new-1');
  });

  it('replace with empty array clears the store', async () => {
    const { db, svc } = openDb();
    await db.transactions.add(makeTx());

    const json = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      type: 'transactions',
      transactions: [],
    });

    await svc.importTransactions(json, 'replace');
    expect(await db.transactions.count()).toBe(0);
  });
});

describe('TX-SCH: schema validation', () => {
  it('collects warnings for unknown fields without aborting', async () => {
    const { svc, db } = openDb();
    const json = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      type: 'transactions',
      transactions: [{ ...makeTx({ id: 'tx-x' }), extraField: 'boom' }],
    });

    const result = await svc.importTransactions(json, 'merge');
    expect(result.imported).toBe(1); // still imported
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('extraField');
    expect(await db.transactions.count()).toBe(1);
  });

  it('skips non-object entries with an error', async () => {
    const { svc } = openDb();
    const json = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      type: 'transactions',
      transactions: [null, 'bad', makeTx({ id: 'valid' })],
    });

    const result = await svc.importTransactions(json, 'merge');
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.errors).toHaveLength(2);
  });
});

describe('TX-50M: 50-MB size limit', () => {
  it('throws BackupError(FILE_TOO_LARGE) for oversized input', async () => {
    const { svc } = openDb();
    const oversized = 'x'.repeat(MAX_IMPORT_BYTES + 1);

    await expect(svc.importTransactions(oversized, 'merge')).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
    });
  });

  it('does not throw for input well under the limit', async () => {
    const { svc } = openDb();
    const smallJson = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      type: 'transactions',
      transactions: [],
    });
    await expect(svc.importTransactions(smallJson, 'merge')).resolves.toBeDefined();
  });
});

describe('error handling', () => {
  it('throws BackupError(INVALID_JSON) for malformed JSON', async () => {
    const { svc } = openDb();
    await expect(svc.importTransactions('{bad json', 'merge')).rejects.toMatchObject({
      code: 'INVALID_JSON',
    });
  });

  it('throws BackupError(INVALID_ENVELOPE) for wrong type field', async () => {
    const { svc } = openDb();
    const json = JSON.stringify({ version: 1, type: 'rules', rules: [] });
    await expect(svc.importTransactions(json, 'merge')).rejects.toMatchObject({
      code: 'INVALID_ENVELOPE',
    });
  });

  it('BackupError is an instance of Error', () => {
    const err = new BackupError('test', 'INVALID_JSON');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BackupError');
    expect(err.code).toBe('INVALID_JSON');
  });
});

// ── Rules tests ───────────────────────────────────────────────────────────────

describe('exportRules()', () => {
  it('returns valid JSON with rules envelope', async () => {
    const { db, svc } = openDb();
    await db.rules.add(makeRule());
    const json = await svc.exportRules();
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe('rules');
    expect(parsed.version).toBe(1);
    expect(Array.isArray(parsed.rules)).toBe(true);
    expect(parsed.rules).toHaveLength(1);
  });

  it('does not include appConfig by default', async () => {
    const { svc } = openDb();
    const json = await svc.exportRules();
    expect(JSON.parse(json).appConfig).toBeUndefined();
  });

  it('includes appConfig when includeAppConfig: true', async () => {
    const { db, svc } = openDb();
    await db.appConfig.add(APP_CFG);
    const json = await svc.exportRules({ includeAppConfig: true });
    const parsed = JSON.parse(json);
    expect(parsed.appConfig).toBeDefined();
    expect(parsed.appConfig.paymentMode).toBe('sepa');
  });

  it('omits appConfig from envelope if not present in DB', async () => {
    const { svc } = openDb();
    const json = await svc.exportRules({ includeAppConfig: true });
    expect(JSON.parse(json).appConfig).toBeUndefined();
  });
});

describe('RU-RTO: rules roundtrip', () => {
  it('import after export yields identical rule records', async () => {
    const { db, svc } = openDb();
    await db.rules.bulkAdd([
      makeRule({ id: 'rule-001' }),
      makeRule({ id: 'rule-002', type: 'scatter', name: 'Supermarkt' }),
    ]);

    const json = await svc.exportRules();
    await db.rules.clear();

    const result = await svc.importRules(json, 'replace');
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);

    const restored = await db.rules.toArray();
    expect(restored).toHaveLength(2);
    expect(restored.find((r) => r.id === 'rule-001')?.name).toBe('Monatsmiete');
  });
});

describe('RU-MRG: rules merge deduplication', () => {
  it('skips rules with existing ids', async () => {
    const { db, svc } = openDb();
    await db.rules.add(makeRule({ id: 'rule-001' }));

    const json = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      type: 'rules',
      rules: [makeRule({ id: 'rule-001' }), makeRule({ id: 'rule-002' })],
    });

    const result = await svc.importRules(json, 'merge');
    expect(result.imported).toBe(1); // only rule-002
    expect(result.skipped).toBe(1); // rule-001 skipped
    expect(await db.rules.count()).toBe(2);
  });
});

describe('RU-REP: rules replace', () => {
  it('clears existing rules and inserts imported ones', async () => {
    const { db, svc } = openDb();
    await db.rules.add(makeRule({ id: 'old-rule' }));

    const json = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      type: 'rules',
      rules: [makeRule({ id: 'new-rule' })],
    });

    const result = await svc.importRules(json, 'replace');
    expect(result.imported).toBe(1);

    const all = await db.rules.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('new-rule');
  });
});

describe('RU-CFG: rules with AppConfig export (P5-03)', () => {
  it('schema validation on appConfig fields produces warnings', async () => {
    const { svc } = openDb();
    const json = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      type: 'rules',
      rules: [makeRule({ id: 'r1' })],
      appConfig: { ...APP_CFG, unknownProp: 'oops' },
    });

    const result = await svc.importRules(json, 'merge');
    expect(result.imported).toBe(1);
    expect(result.errors.some((e) => e.includes('unknownProp'))).toBe(true);
  });
});

describe('rules error handling', () => {
  it('throws BackupError(INVALID_JSON) for malformed input', async () => {
    const { svc } = openDb();
    await expect(svc.importRules('not json', 'merge')).rejects.toMatchObject({
      code: 'INVALID_JSON',
    });
  });

  it('throws BackupError(INVALID_ENVELOPE) when type is transactions', async () => {
    const { svc } = openDb();
    const json = JSON.stringify({
      version: 1,
      type: 'transactions',
      transactions: [],
    });
    await expect(svc.importRules(json, 'merge')).rejects.toMatchObject({
      code: 'INVALID_ENVELOPE',
    });
  });

  it('throws BackupError(FILE_TOO_LARGE) for oversized input', async () => {
    const { svc } = openDb();
    const oversized = 'x'.repeat(MAX_IMPORT_BYTES + 1);
    await expect(svc.importRules(oversized, 'merge')).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
    });
  });
});
