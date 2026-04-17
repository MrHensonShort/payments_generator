/**
 * src/infrastructure/database.ts
 *
 * Dexie.js database definition for payments-generator (P1-02).
 *
 * Schema Version 1
 * Three object stores:
 *   transactions  - generated payment records
 *   rules         - recurring/episode/scatter rule definitions
 *   appConfig     - singleton application configuration
 */

import Dexie, { type EntityTable } from 'dexie';

// ── TypeScript interfaces for store entries ─────────────────────────────────

/** A single generated or manually entered payment transaction. */
export interface TransactionEntry {
  /** UUID primary key. */
  id: string;
  /** Settlement date: YYYY-MM-DD. */
  date: string;
  /** Settlement time: HH:MM. */
  time: string;
  /** Amount in EUR. Positive = credit (Gutschrift), negative = debit (Belastung). */
  amount: number;
  /** Verwendungszweck / payment reference text. */
  purpose: string;
  /** Counterparty name (Empfaenger or Auftraggeber). */
  counterparty: string;
  /** Transaction category key (from categoryEnum). */
  category: string;
  /** Which generator produced this transaction. */
  source: 'recurring' | 'episode' | 'scatter' | 'manual';
  /** ID of the originating rule, if any. */
  ruleId?: string;
}

/**
 * A payment rule driving transaction generation.
 * Covers recurring, episode, and scatter generator types.
 * Rule-specific config is stored in config and narrowed in the domain layer.
 */
export interface RuleEntry {
  /** UUID primary key. */
  id: string;
  /** Discriminator for generator type. */
  type: 'recurring' | 'episode' | 'scatter';
  /** Human-readable name for the rule. */
  name: string;
  /** Generator-specific configuration object (domain layer narrows type). */
  config: unknown;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/**
 * Singleton application configuration.
 * Always exactly one record with id = 1.
 */
export interface AppConfigEntry {
  /** Singleton key - always 1. */
  id: 1;
  /** Generation period start date: YYYY-MM-DD. */
  dateRangeStart: string;
  /** Generation period end date: YYYY-MM-DD. */
  dateRangeEnd: string;
  /**
   * Payment system mode.
   * 'sepa'    - SEPA Credit Transfer (T+1 cut-off, business days only).
   * 'instant' - SEPA Instant Credit Transfer (24/7, no holiday restrictions).
   */
  paymentMode: 'sepa' | 'instant';
  /**
   * German federal state code for public holiday resolution.
   * E.g. 'DE-BY' for Bavaria, 'DE-NW' for North Rhine-Westphalia.
   */
  federalState: string;
  /**
   * Optional seed for the deterministic PRNG (seededRng.ts).
   * When undefined the generator falls back to Math.random().
   */
  seed?: number;
}

// ── Database class ────────────────────────────────────────────────────────────

/**
 * Main Dexie database for payments-generator.
 *
 * Version history
 * 1 - Initial schema: transactions, rules, appConfig
 */
export class PaymentsDatabase extends Dexie {
  transactions!: EntityTable<TransactionEntry, 'id'>;
  rules!: EntityTable<RuleEntry, 'id'>;
  appConfig!: EntityTable<AppConfigEntry, 'id'>;

  /**
   * @param idb - Optional IDBFactory override. Defaults to globalThis.indexedDB.
   *   Pass a fresh fake-indexeddb IDBFactory instance in tests to ensure
   *   proper isolation between test runs (see src/test/helpers/idb.ts).
   */
  constructor(idb?: IDBFactory) {
    super('PaymentsDatabase', {
      // Resolve the IDB factory at construction time so that test helpers
      // (resetIDBFactory) can pass a fresh instance for test isolation.
      // In production (browser), globalThis.indexedDB is the native IDB.
      indexedDB: idb ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB,
    });

    /**
     * Schema version 1.
     *
     * Transactions indexes:
     *   date          - date range queries
     *   category      - filter by category
     *   source        - filter by generator type
     *   ruleId        - look up transactions from a specific rule
     *   [date+source] - compound index for date-filtered type queries
     *
     * Rules indexes:
     *   type      - filter by generator type
     *   createdAt - order rules chronologically
     *
     * appConfig:
     *   id only - singleton, no secondary indexes required
     */
    this.version(1).stores({
      transactions: 'id, date, category, source, ruleId, [date+source]',
      rules: 'id, type, createdAt',
      appConfig: 'id',
    });
  }
}

// ── Singleton instance ────────────────────────────────────────────────────────

/**
 * Shared database instance for the application.
 * Import this singleton throughout the application.
 *
 * In tests, do NOT use this singleton. Instead create a fresh instance per
 * test using the helper:
 *
 *   import { resetIDBFactory } from src/test/helpers/idb;
 *
 *   let idb: IDBFactory;
 *   beforeEach(() => { idb = resetIDBFactory(); });
 *
 *   it(test name, async () => {
 *     const db = new PaymentsDatabase(idb);
 *     await db.open();
 *     // ... test code ...
 *     db.close();
 *   });
 */
export const db = new PaymentsDatabase();
