/**
 * src/workers/generationWorker.ts
 *
 * Web Worker entry point for transaction generation (P3-04 / CLA-38).
 *
 * Exposes a `GenerationWorkerAPI` via a Comlink-compatible message protocol so
 * the main thread can call `generate()` as if it were a regular async function
 * while the computation runs off the main thread.
 *
 * ### Worker protocol messages
 * - **progress**: emitted via the `onProgress` callback after each rule.
 * - **done**:    `generate()` resolves with `GenerationResult`.
 * - **error**:   `generate()` rejects with `DOMException`:
 *   - `AbortError`         – caller aborted via `AbortSignal`.
 *   - `QuotaExceededError` – IndexedDB storage quota exceeded.
 *
 * ### Main-thread usage (after `npm install comlink`)
 * ```ts
 * import * as Comlink from 'comlink';
 * const worker = new Worker(
 *   new URL('./generationWorker', import.meta.url), { type: 'module' },
 * );
 * const api = Comlink.wrap<GenerationWorkerAPI>(worker);
 * const result = await api.generate(
 *   ruleIds, config,
 *   Comlink.proxy(onProgress),
 *   Comlink.proxy(controller.signal),
 * );
 * worker.terminate();
 * ```
 *
 * ### Comlink shim
 * Until `comlink` is installed (`npm install comlink`), the local `comlinkShim`
 * provides a compatible `expose()` implementation.  Replace with:
 *   `import { expose } from 'comlink';`
 */

import { expose } from 'comlink';
import { db } from '../infrastructure/database.js';
import { RuleRepo } from '../infrastructure/ruleRepo.js';
import { GenerationOrchestrator } from '../domain/GenerationOrchestrator.js';
import type { FederalState } from '../domain/calendar/WorkingDayCalendar.js';
import type { AnyRule, GenerationContext, Transaction } from '../domain/types.js';
import type { GenerationConfig, GenerationWorkerAPI } from './workerTypes.js';
import type {
  GenerationProgressEvent,
  GenerationResult,
} from '../domain/GenerationOrchestrator.js';

// Re-export types for main-thread import convenience.
export type { GenerationConfig, GenerationWorkerAPI, GenerationProgressEvent, GenerationResult };

// ── Worker-local singletons ───────────────────────────────────────────────────

const ruleRepo = new RuleRepo(db);

const orchestrator = new GenerationOrchestrator(async (entries: Transaction[]) => {
  // Transaction and TransactionEntry share the same shape; cast is safe.
  await db.transactions.bulkAdd(
    entries as unknown as Parameters<typeof db.transactions.bulkAdd>[0],
  );
});

// ── Worker API implementation ─────────────────────────────────────────────────

const workerApi: GenerationWorkerAPI = {
  async generate(
    ruleIds: string[],
    config: GenerationConfig,
    onProgress: (event: GenerationProgressEvent) => void,
    signal?: AbortSignal,
  ): Promise<GenerationResult> {
    const start = Date.now();

    // Load the specified rules from IndexedDB.
    const allEntries = await ruleRepo.getAll();
    const filtered =
      ruleIds.length === 0 ? allEntries : allEntries.filter((e) => ruleIds.includes(e.id));

    // Cast stored config (unknown) to AnyRule – domain layer validates.
    const rules = filtered.map((e) => e.config as AnyRule);

    // Build GenerationContext from incoming config.
    const context: GenerationContext = {
      startDate: config.startDate,
      endDate: config.endDate,
      paymentMode: config.paymentMode ?? 'sepa',
      federalState: (config.stateCode ?? 'DE-BY') as FederalState,
      globalSeed: config.seed,
    };

    const result = await orchestrator.generate(rules, context, onProgress, signal);

    return {
      transactionCount: result.transactionCount,
      durationMs: Date.now() - start,
    };
  },
};

// Expose the API via Comlink-compatible message protocol.
expose(workerApi as unknown as Record<string, (...args: unknown[]) => unknown>);
