/**
 * src/infrastructure/csvExporter.ts
 *
 * CSV export utility for Transaction data (P5-01 / CLA-63).
 *
 * Uses Papa Parse (unparse) to serialise Transaction arrays to CSV with
 * configurable delimiter, encoding, date-format, filename, and optional BOM.
 *
 * Acceptance criteria:
 *   EX-01  Export all visible transactions
 *   EX-02  Export only filtered transactions (via optional `filter` predicate)
 *   EX-03  Configurable delimiter: comma / semicolon / tab
 *   EX-04  Configurable encoding: UTF-8 / Latin-1
 *   EX-05  Configurable date format: ISO (YYYY-MM-DD) / DE (DD.MM.YYYY) / US (MM/DD/YYYY)
 *   EX-06  Configurable filename
 *   EX-07  Optional UTF-8 BOM (U+FEFF) for Excel compatibility
 */

import Papa from 'papaparse';
import type { Transaction } from '../domain/types.js';

// ── Configuration types ───────────────────────────────────────────────────────

/** Field delimiter character used in the CSV output. */
export type CsvDelimiter = ',' | ';' | '\t';

/** Character encoding applied to the resulting Blob / byte stream. */
export type CsvEncoding = 'UTF-8' | 'Latin-1';

/** How the `date` field of each transaction is formatted in the CSV. */
export type CsvDateFormat = 'ISO' | 'DE' | 'US';

/**
 * Full configuration for a CSV export operation.
 *
 * All fields are required so callers are explicit about their choices.
 * Use `DEFAULT_EXPORT_CONFIG` as a starting point and spread overrides.
 */
export interface CsvExportConfig {
  /** EX-03: Field separator character. */
  delimiter: CsvDelimiter;
  /** EX-04: Output encoding. */
  encoding: CsvEncoding;
  /** EX-05: Date format applied to the `date` column. */
  dateFormat: CsvDateFormat;
  /** EX-06: Suggested filename for the browser download. */
  filename: string;
  /** EX-07: Prepend UTF-8 BOM (U+FEFF) for Excel auto-detection. */
  bom: boolean;
  /** EX-02: Optional predicate; only matching transactions are exported. */
  filter?: (tx: Transaction) => boolean;
}

/** Sensible defaults – override individual fields as needed. */
export const DEFAULT_EXPORT_CONFIG: Omit<CsvExportConfig, 'filter'> = {
  delimiter: ',',
  encoding: 'UTF-8',
  dateFormat: 'ISO',
  filename: 'transactions.csv',
  bom: false,
};

// ── Column order ──────────────────────────────────────────────────────────────

/** Fixed column order for the CSV header row. */
const CSV_COLUMNS = [
  'id',
  'date',
  'time',
  'amount',
  'purpose',
  'counterparty',
  'category',
  'source',
  'ruleId',
] as const;

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Format a YYYY-MM-DD date string according to the requested output format.
 *
 * @param date  - ISO date string from the Transaction (e.g. "2025-03-15").
 * @param fmt   - Target format key.
 * @returns Formatted date string.
 */
function formatDate(date: string, fmt: CsvDateFormat): string {
  const [y, m, d] = date.split('-');
  switch (fmt) {
    case 'DE':
      return `${d}.${m}.${y}`;
    case 'US':
      return `${m}/${d}/${y}`;
    case 'ISO':
    default:
      return date;
  }
}

/** Map a single Transaction to a plain string/number record for Papa.unparse. */
function toRow(tx: Transaction, dateFormat: CsvDateFormat): Record<string, string | number> {
  return {
    id: tx.id,
    date: formatDate(tx.date, dateFormat),
    time: tx.time,
    amount: tx.amount,
    purpose: tx.purpose,
    counterparty: tx.counterparty,
    category: tx.category,
    source: tx.source,
    ruleId: tx.ruleId ?? '',
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the raw CSV string from a transaction list.
 *
 * EX-01: All transactions when no `filter` is set.
 * EX-02: Only matching transactions when `filter` is provided.
 * EX-03: Delimiter from config.
 * EX-05: Date column formatted per config.
 * EX-07: BOM character prepended when `config.bom === true`.
 *
 * This is the pure, side-effect-free core used by both `buildCsvBlob` and
 * the unit tests (which avoid browser-only `Blob` where possible).
 *
 * @param transactions - Source transaction array.
 * @param config       - Export configuration.
 * @returns CSV string (with optional leading BOM).
 */
export function buildCsvString(transactions: Transaction[], config: CsvExportConfig): string {
  // EX-02: apply optional filter
  const rows = (config.filter ? transactions.filter(config.filter) : transactions).map((tx) =>
    toRow(tx, config.dateFormat),
  );

  // EX-03: Papa.unparse with configured delimiter
  const csv = Papa.unparse(rows, {
    delimiter: config.delimiter,
    columns: [...CSV_COLUMNS],
    header: true,
    newline: '\r\n',
  });

  // EX-07: prepend BOM when requested
  return config.bom ? '\uFEFF' + csv : csv;
}

/**
 * Encode a CSV string to Latin-1 bytes.
 *
 * Characters outside Latin-1 (code point > 255) are replaced with `?` (0x3F).
 * This mirrors the behaviour of most desktop applications when saving as
 * "Windows-1252 / ISO-8859-1" without transcoding.
 */
function toLatin1Bytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[i] = code < 256 ? code : 0x3f; // '?'
  }
  return bytes;
}

/**
 * Build a `Blob` suitable for browser download.
 *
 * EX-04: The Blob MIME type and content encoding reflect `config.encoding`.
 *        Latin-1 output encodes each character to a single byte.
 *
 * @param transactions - Source transaction array.
 * @param config       - Export configuration.
 * @returns `Blob` with the correct MIME type and encoding.
 */
export function buildCsvBlob(transactions: Transaction[], config: CsvExportConfig): Blob {
  const content = buildCsvString(transactions, config);

  if (config.encoding === 'Latin-1') {
    return new Blob([toLatin1Bytes(content)], { type: 'text/csv;charset=iso-8859-1' });
  }

  return new Blob([content], { type: 'text/csv;charset=utf-8' });
}

/**
 * Trigger a browser file-download of the transaction CSV.
 *
 * EX-06: Uses `config.filename` as the suggested download name.
 *
 * **Important:** This function relies on browser-only APIs (`URL.createObjectURL`,
 * `document.createElement`).  It cannot be called in a Node / Vitest (node
 * environment) test — use `buildCsvString` / `buildCsvBlob` for unit tests.
 *
 * @param transactions - Source transaction array.
 * @param config       - Export configuration.
 */
export function downloadCsv(transactions: Transaction[], config: CsvExportConfig): void {
  const blob = buildCsvBlob(transactions, config);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = config.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
