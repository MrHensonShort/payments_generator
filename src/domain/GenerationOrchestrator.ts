/**
 * src/domain/GenerationOrchestrator.ts
 *
 * GenerationOrchestrator – coordinates all three generator engines and writes
 * the resulting transactions to the database in chunked bulk inserts (P3-03 / CLA-37).
 *
 * ### Responsibilities
 * 1. Accept a list of `AnyRule` objects and a `GenerationContext`.
 * 2. Dispatch each rule to the appropriate engine:
 *    - `RecurringRule` → `RecurringEngine`
 *    - `EpisodeRule`   → `EpisodeEngine`
 *    - `ScatterRule`   → `ScatterEngine`
 * 3. Insert generated transactions in chunks of `CHUNK_SIZE` (1 000) using the
 *    caller-supplied `bulkInsert` function.
 * 4. Emit `GenerationProgressEvent` after each rule is fully inserted.
 * 5. Respect `AbortSignal` by checking for abort between rule iterations and
 *    between chunk inserts.
 * 6. Propagate `QuotaExceededError` from IndexedDB as a `DOMException`.
 *
 * ### Worker threshold
 * `shouldUseWorker()` returns `true` when the caller should delegate generation
 * to a Web Worker:
 *   - The date range spans ≥ 1 year, OR
 *   - There are ≥ 10 rules.
 *
 * ### Usage
 * ```ts
 * const orchestrator = new GenerationOrchestrator(async (entries) => {
 *   await db.transactions.bulkAdd(entries);
 * });
 *
 * const result = await orchestrator.generate(rules, context, onProgress, signal);
 * console.log(result.transactionCount);
 * ```
 */

import { RecurringEngine } from './RecurringEngine.js';
import { EpisodeEngine } from './EpisodeEngine.js';
import { ScatterEngine } from './ScatterEngine.js';
import type { AnyRule, GenerationContext, Transaction } from './types.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Transactions per IndexedDB bulk-insert batch. */
const CHUNK_SIZE = 1_000;

/** Minimum rule count that triggers Web Worker delegation. */
const WORKER_MIN_RULES = 10;

/** Minimum date range span (months) that triggers Web Worker delegation. */
const WORKER_MIN_MONTHS = 12;

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * Progress snapshot emitted after each rule finishes processing.
 * Mirrors the shape expected by the Web Worker protocol (P3-04).
 */
export interface GenerationProgressEvent {
  /** Number of rules fully processed so far. */
  processed: number;
  /** Total number of rules to process. */
  total: number;
  /** Progress expressed as an integer percentage in [0, 100]. */
  percentage: number;
}

/** Summary returned when generation completes successfully. */
export interface GenerationResult {
  /** Total number of transactions written to the database. */
  transactionCount: number;
  /** Wall-clock duration from start to completion in milliseconds. */
  durationMs: number;
}

/**
 * A function that bulk-inserts a batch of transaction entries into the
 * database.  Callers provide this to keep the orchestrator DB-agnostic and
 * easy to test in isolation.
 */
export type BulkInsertFn = (entries: Transaction[]) => Promise<void>;

// ── GenerationOrchestrator ────────────────────────────────────────────────────

export class GenerationOrchestrator {
  private readonly recurringEngine = new RecurringEngine();
  private readonly episodeEngine = new EpisodeEngine();
  private readonly scatterEngine = new ScatterEngine();

  constructor(private readonly bulkInsert: BulkInsertFn) {}

  /**
   * Run all engines for the supplied rules and persist transactions.
   *
   * @param rules      - Enabled rules to process; disabled rules are skipped.
   * @param context    - Date range, payment mode, federal state, and PRNG seed.
   * @param onProgress - Optional callback invoked after each rule completes.
   * @param signal     - Optional `AbortSignal`; throws `DOMException("AbortError")`
   *                     when aborted.
   * @returns Summary of how many transactions were generated and how long it took.
   * @throws {DOMException} name="AbortError" when `signal` is aborted.
   * @throws {DOMException} name="QuotaExceededError" when IDB storage is full.
   */
  async generate(
    rules: AnyRule[],
    context: GenerationContext,
    onProgress?: (event: GenerationProgressEvent) => void,
    signal?: AbortSignal,
  ): Promise<GenerationResult> {
    const start = Date.now();
    let totalTransactions = 0;
    const total = rules.length;

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) {
        throw new DOMException('Generation aborted', 'AbortError');
      }

      const rule = rules[i]!;
      const transactions = this.runEngine(rule, context);

      // Chunked bulk insert.
      for (let j = 0; j < transactions.length; j += CHUNK_SIZE) {
        if (signal?.aborted) {
          throw new DOMException('Generation aborted', 'AbortError');
        }

        const chunk = transactions.slice(j, j + CHUNK_SIZE);

        try {
          await this.bulkInsert(chunk);
        } catch (err: unknown) {
          // Surface IDB quota errors as a DOMException so the caller can
          // distinguish them from general storage failures.
          if (err instanceof DOMException && err.name === 'QuotaExceededError') {
            throw err;
          }
          if (err instanceof Error && err.name === 'QuotaExceededError') {
            throw new DOMException(err.message, 'QuotaExceededError');
          }
          throw err;
        }
      }

      totalTransactions += transactions.length;

      onProgress?.({
        processed: i + 1,
        total,
        percentage: total > 0 ? Math.round(((i + 1) / total) * 100) : 100,
      });
    }

    return {
      transactionCount: totalTransactions,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Heuristic: should this generation run be offloaded to a Web Worker?
   *
   * Returns `true` when:
   *   - The rule count is ≥ `WORKER_MIN_RULES` (10), or
   *   - The date range spans ≥ `WORKER_MIN_MONTHS` (12) calendar months.
   */
  shouldUseWorker(rules: AnyRule[], context: GenerationContext): boolean {
    if (rules.length >= WORKER_MIN_RULES) return true;

    const startYear = parseInt(context.startDate.slice(0, 4), 10);
    const startMonth = parseInt(context.startDate.slice(5, 7), 10);
    const endYear = parseInt(context.endDate.slice(0, 4), 10);
    const endMonth = parseInt(context.endDate.slice(5, 7), 10);
    const monthSpan = (endYear - startYear) * 12 + (endMonth - startMonth);

    return monthSpan >= WORKER_MIN_MONTHS;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private runEngine(rule: AnyRule, context: GenerationContext): Transaction[] {
    switch (rule.type) {
      case 'recurring':
        return this.recurringEngine.generate(rule, context);
      case 'episode':
        return this.episodeEngine.generate(rule, context);
      case 'scatter':
        return this.scatterEngine.generate(rule, context);
    }
  }
}
