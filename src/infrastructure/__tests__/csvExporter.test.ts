/**
 * src/infrastructure/__tests__/csvExporter.test.ts
 *
 * Unit tests for csvExporter (P5-01 / CLA-63).
 *
 * Covers:
 *   EX-01  Export all transactions
 *   EX-02  Export only filtered transactions
 *   EX-03  Configurable delimiter (, / ; / Tab)
 *   EX-04  Configurable encoding – Blob MIME type
 *   EX-05  Configurable date format (ISO / DE / US)
 *   EX-06  Configurable filename (config property only; download is browser-only)
 *   EX-07  BOM option
 *   RTO    Roundtrip: buildCsvString → Papa.parse → data matches source
 */

import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../domain/types.js';
import {
  DEFAULT_EXPORT_CONFIG,
  buildCsvBlob,
  buildCsvString,
  type CsvExportConfig,
} from '../csvExporter.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
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

const TRANSACTIONS: Transaction[] = [
  makeTx({ id: 'tx-001', date: '2025-01-05', amount: -800, category: 'Miete' }),
  makeTx({
    id: 'tx-002',
    date: '2025-01-15',
    amount: 2500,
    category: 'Gehalt',
    source: 'manual',
    ruleId: undefined,
  }),
  makeTx({ id: 'tx-003', date: '2025-02-05', amount: -800, category: 'Miete' }),
  makeTx({
    id: 'tx-004',
    date: '2025-02-10',
    amount: -45.99,
    category: 'Supermarkt',
    source: 'scatter',
  }),
];

function cfg(overrides: Partial<CsvExportConfig> = {}): CsvExportConfig {
  return { ...DEFAULT_EXPORT_CONFIG, ...overrides };
}

// ── EX-01: Export all ─────────────────────────────────────────────────────────

describe('EX-01: export all transactions', () => {
  it('includes every transaction when no filter is set', () => {
    const csv = buildCsvString(TRANSACTIONS, cfg());
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    expect(data).toHaveLength(TRANSACTIONS.length);
  });

  it('produces a header row with the expected columns', () => {
    const csv = buildCsvString(TRANSACTIONS, cfg());
    const { meta } = Papa.parse<Record<string, string>>(csv, { header: true });
    expect(meta.fields).toEqual([
      'id',
      'date',
      'time',
      'amount',
      'purpose',
      'counterparty',
      'category',
      'source',
      'ruleId',
    ]);
  });

  it('exports an empty array without error', () => {
    const csv = buildCsvString([], cfg());
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    expect(data).toHaveLength(0);
  });
});

// ── EX-02: Filtered export ────────────────────────────────────────────────────

describe('EX-02: filtered export', () => {
  it('only includes transactions matching the filter predicate', () => {
    const config = cfg({ filter: (tx) => tx.category === 'Miete' });
    const csv = buildCsvString(TRANSACTIONS, config);
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    expect(data).toHaveLength(2);
    expect(data.every((r) => r.category === 'Miete')).toBe(true);
  });

  it('returns an empty CSV body when no transaction matches the filter', () => {
    const config = cfg({ filter: () => false });
    const csv = buildCsvString(TRANSACTIONS, config);
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    expect(data).toHaveLength(0);
  });

  it('exports all when filter accepts everything', () => {
    const config = cfg({ filter: () => true });
    const csv = buildCsvString(TRANSACTIONS, config);
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    expect(data).toHaveLength(TRANSACTIONS.length);
  });
});

// ── EX-03: Delimiter ──────────────────────────────────────────────────────────

describe('EX-03: configurable delimiter', () => {
  it('uses comma delimiter by default', () => {
    const csv = buildCsvString([makeTx()], cfg({ delimiter: ',' }));
    const firstDataLine = csv.split('\r\n')[1];
    expect(firstDataLine).toContain(',');
  });

  it('uses semicolon delimiter', () => {
    const csv = buildCsvString([makeTx()], cfg({ delimiter: ';' }));
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      delimiter: ';',
      skipEmptyLines: true,
    });
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('tx-001');
  });

  it('uses tab delimiter', () => {
    const csv = buildCsvString([makeTx()], cfg({ delimiter: '\t' }));
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      delimiter: '\t',
      skipEmptyLines: true,
    });
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('tx-001');
  });
});

// ── EX-04: Encoding ───────────────────────────────────────────────────────────

describe('EX-04: configurable encoding', () => {
  it('produces a UTF-8 Blob by default', () => {
    const blob = buildCsvBlob([makeTx()], cfg({ encoding: 'UTF-8' }));
    expect(blob.type).toBe('text/csv;charset=utf-8');
  });

  it('produces a Latin-1 Blob when encoding is Latin-1', () => {
    const blob = buildCsvBlob([makeTx()], cfg({ encoding: 'Latin-1' }));
    expect(blob.type).toBe('text/csv;charset=iso-8859-1');
  });

  it('Latin-1 Blob has correct byte count for ASCII-only content', async () => {
    const tx = makeTx({
      id: 'tx-l1',
      purpose: 'Rent',
      counterparty: 'Landlord',
      category: 'Miete',
    });
    const blobUtf8 = buildCsvBlob([tx], cfg({ encoding: 'UTF-8' }));
    const blobLatin = buildCsvBlob([tx], cfg({ encoding: 'Latin-1' }));
    // For ASCII-only content the byte sizes should be equal
    expect(blobLatin.size).toBe(blobUtf8.size);
  });
});

// ── EX-05: Date format ────────────────────────────────────────────────────────

describe('EX-05: configurable date format', () => {
  const tx = makeTx({ date: '2025-03-15' });

  it('formats as ISO (YYYY-MM-DD) by default', () => {
    const csv = buildCsvString([tx], cfg({ dateFormat: 'ISO' }));
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    expect(data[0].date).toBe('2025-03-15');
  });

  it('formats as DE (DD.MM.YYYY)', () => {
    const csv = buildCsvString([tx], cfg({ dateFormat: 'DE' }));
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    expect(data[0].date).toBe('15.03.2025');
  });

  it('formats as US (MM/DD/YYYY)', () => {
    const csv = buildCsvString([tx], cfg({ dateFormat: 'US' }));
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    expect(data[0].date).toBe('03/15/2025');
  });
});

// ── EX-06: Filename ───────────────────────────────────────────────────────────

describe('EX-06: configurable filename', () => {
  it('DEFAULT_EXPORT_CONFIG uses transactions.csv', () => {
    expect(DEFAULT_EXPORT_CONFIG.filename).toBe('transactions.csv');
  });

  it('accepts a custom filename', () => {
    const config = cfg({ filename: 'jan-2025.csv' });
    expect(config.filename).toBe('jan-2025.csv');
  });
});

// ── EX-07: BOM ────────────────────────────────────────────────────────────────

describe('EX-07: UTF-8 BOM for Excel compatibility', () => {
  it('does not include BOM by default', () => {
    const csv = buildCsvString([makeTx()], cfg({ bom: false }));
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('prepends BOM (U+FEFF) when bom: true', () => {
    const csv = buildCsvString([makeTx()], cfg({ bom: true }));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('BOM Blob still parses correctly (Papa ignores BOM)', () => {
    const csv = buildCsvString(TRANSACTIONS, cfg({ bom: true }));
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    expect(data).toHaveLength(TRANSACTIONS.length);
  });
});

// ── Roundtrip (RTO) ───────────────────────────────────────────────────────────

describe('Roundtrip: buildCsvString → Papa.parse', () => {
  it('preserves all field values through the CSV roundtrip', () => {
    const tx = makeTx();
    const csv = buildCsvString([tx], cfg());
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
    });
    const row = data[0];
    expect(row.id).toBe(tx.id);
    expect(row.date).toBe(tx.date); // ISO format
    expect(row.time).toBe(tx.time);
    expect(Number(row.amount)).toBeCloseTo(tx.amount, 2);
    expect(row.purpose).toBe(tx.purpose);
    expect(row.counterparty).toBe(tx.counterparty);
    expect(row.category).toBe(tx.category);
    expect(row.source).toBe(tx.source);
    expect(row.ruleId).toBe(tx.ruleId);
  });

  it('round-trips multiple transactions preserving order', () => {
    const csv = buildCsvString(TRANSACTIONS, cfg());
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
    });
    expect(data).toHaveLength(TRANSACTIONS.length);
    TRANSACTIONS.forEach((tx, i) => {
      expect(data[i].id).toBe(tx.id);
      expect(Number(data[i].amount)).toBeCloseTo(tx.amount, 2);
    });
  });

  it('ruleId is empty string for transactions without a rule', () => {
    const tx = makeTx({ ruleId: undefined });
    const csv = buildCsvString([tx], cfg());
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    expect(data[0].ruleId).toBe('');
  });

  it('round-trips purposes containing commas (semicolon delimiter)', () => {
    const tx = makeTx({ purpose: 'Einkauf, Getränke, Obst' });
    const csv = buildCsvString([tx], cfg({ delimiter: ';' }));
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      delimiter: ';',
      skipEmptyLines: true,
    });
    expect(data[0].purpose).toBe('Einkauf, Getränke, Obst');
  });

  it('round-trips purposes containing quotes', () => {
    const tx = makeTx({ purpose: 'Test "quoted" purpose' });
    const csv = buildCsvString([tx], cfg());
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    expect(data[0].purpose).toBe('Test "quoted" purpose');
  });

  it('round-trips unicode characters in UTF-8', () => {
    const tx = makeTx({ counterparty: 'Müller GmbH & Co. KG', purpose: 'Überweisung März' });
    const csv = buildCsvString([tx], cfg({ encoding: 'UTF-8' }));
    const { data } = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    expect(data[0].counterparty).toBe('Müller GmbH & Co. KG');
    expect(data[0].purpose).toBe('Überweisung März');
  });
});
