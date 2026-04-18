/**
 * src/infrastructure/BackupService.ts
 *
 * JSON backup / restore service for transactions and rules (P5-02 / CLA-64,
 * P5-03 / CLA-65).
 *
 * ### Transaction backup (P5-02)
 *   - `exportTransactions()` – serialise all transactions to JSON v1 with
 *     envelope metadata (version, exportedAt, type).
 *   - `importTransactions(json, mode)` – parse, validate, and persist.
 *     - `'merge'`   – add only transactions whose id is not already stored.
 *     - `'replace'` – clear the store, then add all imported transactions.
 *
 * ### Rule backup (P5-03)
 *   - `exportRules(options?)` – serialise all rules; optionally include the
 *     singleton AppConfig.
 *   - `importRules(json, mode)` – same merge / replace semantics for rules.
 *
 * ### Common behaviour
 *   - 50 MB limit: reject input larger than 50 MiB before attempting to parse.
 *   - Schema validation: unknown top-level fields in each record are collected
 *     in `ImportResult.errors[]`; the import still proceeds for valid records.
 *   - All operations are wrapped in a `BackupError` on unexpected failure.
 */

import type { AppConfigEntry, PaymentsDatabase, RuleEntry, TransactionEntry } from './database.js';

// ── Constants ────────────────────────────────────────────────────────────────

/** Current backup format version. Bump on breaking schema changes. */
export const BACKUP_VERSION = 1;

/** Maximum allowed import size in bytes (50 MiB). */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

// ── Error type ────────────────────────────────────────────────────────────────

/** Structured error thrown by BackupService operations. */
export class BackupError extends Error {
  constructor(
    message: string,
    /** Machine-readable error code for callers. */
    public readonly code:
      | 'FILE_TOO_LARGE'
      | 'INVALID_JSON'
      | 'INVALID_ENVELOPE'
      | 'WRONG_BACKUP_TYPE'
      | 'DB_ERROR',
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

// ── Result types ─────────────────────────────────────────────────────────────

/**
 * Outcome of an import operation.
 *
 * - `imported` – number of records written to the database.
 * - `skipped`  – number of records skipped (duplicate id in merge mode).
 * - `errors`   – validation warnings (unknown fields etc.).  A non-empty array
 *               does NOT abort the import; it is informational only.
 */
export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// ── Import mode ───────────────────────────────────────────────────────────────

/**
 * Import strategy.
 *
 * - `'merge'`   – keep existing records; add only those with unknown ids.
 * - `'replace'` – delete all existing records first, then insert all imported
 *                 records.  The UI layer is responsible for showing a confirm
 *                 dialog before calling with `'replace'`.
 */
export type ImportMode = 'merge' | 'replace';

// ── Backup envelope types ─────────────────────────────────────────────────────

/** JSON envelope wrapping a transaction backup. */
export interface TransactionBackupEnvelope {
  version: 1;
  exportedAt: string;
  type: 'transactions';
  transactions: TransactionEntry[];
}

/** Options for `exportRules()`. */
export interface ExportRulesOptions {
  /** When true, include the singleton AppConfig in the backup. Default: false. */
  includeAppConfig?: boolean;
}

/** JSON envelope wrapping a rules (+ optional config) backup. */
export interface RulesBackupEnvelope {
  version: 1;
  exportedAt: string;
  type: 'rules';
  rules: RuleEntry[];
  appConfig?: AppConfigEntry;
}

// ── Known field sets for schema validation ────────────────────────────────────

const TRANSACTION_FIELDS = new Set([
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

const RULE_FIELDS = new Set(['id', 'type', 'name', 'config', 'createdAt']);

const APP_CONFIG_FIELDS = new Set([
  'id',
  'dateRangeStart',
  'dateRangeEnd',
  'paymentMode',
  'federalState',
  'seed',
]);

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Check that `json` is not larger than `MAX_IMPORT_BYTES`.
 * Throws `BackupError('FILE_TOO_LARGE')` if the limit is exceeded.
 */
function assertSizeLimit(json: string): void {
  // UTF-16 string length in JS is not the same as UTF-8 byte length, but for
  // size-guard purposes we use the encoded byte length.
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > MAX_IMPORT_BYTES) {
    throw new BackupError(
      `Import data exceeds the 50 MiB limit (got ${(bytes / (1024 * 1024)).toFixed(1)} MiB).`,
      'FILE_TOO_LARGE',
    );
  }
}

/**
 * Validate the fields of a single record against an allowed set.
 * Collects warnings for unknown keys into `errors[]`.
 */
function validateRecord(
  record: Record<string, unknown>,
  allowedFields: Set<string>,
  label: string,
  index: number,
  errors: string[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowedFields.has(key)) {
      errors.push(`${label}[${index}]: unknown field "${key}" – ignored`);
    }
  }
}

// ── BackupService ─────────────────────────────────────────────────────────────

/**
 * Backup and restore service.
 *
 * Instantiate with a `PaymentsDatabase` (or a test-isolated instance).
 * All methods are async and safe to call concurrently by separate UI actions.
 */
export class BackupService {
  constructor(private readonly db: PaymentsDatabase) {}

  // ── Transaction export ──────────────────────────────────────────────────────

  /**
   * Export all transactions to a JSON string.
   *
   * @returns Serialised `TransactionBackupEnvelope` (formatted JSON).
   */
  async exportTransactions(): Promise<string> {
    const transactions = await this.db.transactions.toArray();
    const envelope: TransactionBackupEnvelope = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      type: 'transactions',
      transactions,
    };
    return JSON.stringify(envelope, null, 2);
  }

  // ── Transaction import ──────────────────────────────────────────────────────

  /**
   * Import transactions from a JSON backup string.
   *
   * @param json - Raw JSON string produced by `exportTransactions()` (or
   *               compatible third-party data).
   * @param mode - `'merge'` or `'replace'`.
   * @returns `ImportResult` with counts and any validation warnings.
   * @throws `BackupError` on size limit, JSON parse failure, or envelope mismatch.
   */
  async importTransactions(json: string, mode: ImportMode): Promise<ImportResult> {
    assertSizeLimit(json);

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new BackupError('Failed to parse JSON: invalid syntax.', 'INVALID_JSON');
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as Record<string, unknown>).type !== 'transactions' ||
      !Array.isArray((parsed as Record<string, unknown>).transactions)
    ) {
      throw new BackupError(
        'Invalid backup envelope: expected { type: "transactions", transactions: [...] }.',
        'INVALID_ENVELOPE',
      );
    }

    const envelope = parsed as { transactions: unknown[] };
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    // Validate each record
    const records: TransactionEntry[] = [];
    for (let i = 0; i < envelope.transactions.length; i++) {
      const raw = envelope.transactions[i];
      if (typeof raw !== 'object' || raw === null) {
        errors.push(`transactions[${i}]: expected object, got ${typeof raw} – skipped`);
        skipped++;
        continue;
      }
      validateRecord(raw as Record<string, unknown>, TRANSACTION_FIELDS, 'transactions', i, errors);
      records.push(raw as TransactionEntry);
    }

    if (mode === 'replace') {
      await this.db.transactions.clear();
    }

    if (mode === 'merge') {
      const existingIds = new Set(await this.db.transactions.toCollection().primaryKeys());
      for (const tx of records) {
        if (existingIds.has(tx.id)) {
          skipped++;
        } else {
          await this.db.transactions.add(tx);
          imported++;
        }
      }
    } else {
      // replace: all valid records go in
      if (records.length > 0) {
        await this.db.transactions.bulkAdd(records);
        imported = records.length;
      }
    }

    return { imported, skipped, errors };
  }

  // ── Rule export ─────────────────────────────────────────────────────────────

  /**
   * Export all rules to a JSON string.
   *
   * @param options.includeAppConfig - When `true`, include the singleton
   *   AppConfig record in the backup.  Defaults to `false`.
   * @returns Serialised `RulesBackupEnvelope` (formatted JSON).
   */
  async exportRules(options: ExportRulesOptions = {}): Promise<string> {
    const rules = await this.db.rules.toArray();
    const envelope: RulesBackupEnvelope = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      type: 'rules',
      rules,
    };

    if (options.includeAppConfig) {
      const appConfig = await this.db.appConfig.get(1);
      if (appConfig) {
        envelope.appConfig = appConfig;
      }
    }

    return JSON.stringify(envelope, null, 2);
  }

  // ── Rule import ─────────────────────────────────────────────────────────────

  /**
   * Import rules from a JSON backup string.
   *
   * @param json - Raw JSON string produced by `exportRules()`.
   * @param mode - `'merge'` or `'replace'`.
   * @returns `ImportResult` with counts and any validation warnings.
   * @throws `BackupError` on size limit, JSON parse failure, or envelope mismatch.
   */
  async importRules(json: string, mode: ImportMode): Promise<ImportResult> {
    assertSizeLimit(json);

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new BackupError('Failed to parse JSON: invalid syntax.', 'INVALID_JSON');
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as Record<string, unknown>).type !== 'rules' ||
      !Array.isArray((parsed as Record<string, unknown>).rules)
    ) {
      throw new BackupError(
        'Invalid backup envelope: expected { type: "rules", rules: [...] }.',
        'INVALID_ENVELOPE',
      );
    }

    const envelope = parsed as { rules: unknown[]; appConfig?: unknown };
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    // Validate each rule record
    const records: RuleEntry[] = [];
    for (let i = 0; i < envelope.rules.length; i++) {
      const raw = envelope.rules[i];
      if (typeof raw !== 'object' || raw === null) {
        errors.push(`rules[${i}]: expected object, got ${typeof raw} – skipped`);
        skipped++;
        continue;
      }
      validateRecord(raw as Record<string, unknown>, RULE_FIELDS, 'rules', i, errors);
      records.push(raw as RuleEntry);
    }

    // Optionally validate appConfig fields (informational only)
    if (envelope.appConfig !== undefined && typeof envelope.appConfig === 'object') {
      validateRecord(
        envelope.appConfig as Record<string, unknown>,
        APP_CONFIG_FIELDS,
        'appConfig',
        0,
        errors,
      );
    }

    if (mode === 'replace') {
      await this.db.rules.clear();
    }

    if (mode === 'merge') {
      const existingIds = new Set(await this.db.rules.toCollection().primaryKeys());
      for (const rule of records) {
        if (existingIds.has(rule.id)) {
          skipped++;
        } else {
          await this.db.rules.add(rule);
          imported++;
        }
      }
    } else {
      if (records.length > 0) {
        await this.db.rules.bulkAdd(records);
        imported = records.length;
      }
    }

    return { imported, skipped, errors };
  }
}
