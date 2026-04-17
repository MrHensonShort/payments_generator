/**
 * WorkerProxy – Main-Thread-Wrapper für generationWorker (P3-08)
 *
 * Wraps the Comlink-based Web Worker (`src/workers/generationWorker.ts`, P3-04)
 * with a clean main-thread API.
 *
 * Features:
 *   - Lazy Worker initialisation (Worker is only created on first `start()`)
 *   - AbortController-based cancellation via `cancel()`
 *   - Progress callbacks forwarded from Worker to caller via `Comlink.proxy()`
 *   - Fallback to main-thread execution via `GenerationOrchestrator` when the
 *     Worker API is unavailable (old browsers, server-side rendering, tests)
 *
 * Usage:
 *   ```ts
 *   import { workerProxy } from './WorkerProxy';
 *
 *   const result = await workerProxy.start(['rule-1', 'rule-2'], config, (e) => {
 *     console.log(`Progress: ${e.percentage}%`);
 *   });
 *   // → { transactionCount: number, durationMs: number }
 *
 *   workerProxy.cancel(); // abort at any time
 *   ```
 *
 * Dependency: requires `comlink` as a runtime dependency.
 *   Type stubs: `src/types/comlink.d.ts` (until `npm install comlink` is run).
 */

import * as Comlink from 'comlink';

// ── Re-export canonical shared types ─────────────────────────────────────────
// Types are defined in workerTypes.ts so both the Worker and the main-thread
// wrapper share the same contract.
export type {
  GenerationConfig,
  GenerationProgressEvent,
  GenerationResult,
  GenerationWorkerAPI,
} from '../workers/workerTypes.js';
import type {
  GenerationConfig,
  GenerationProgressEvent,
  GenerationResult,
  GenerationWorkerAPI,
} from '../workers/workerTypes.js';

// ── Type-only imports for the fallback path ───────────────────────────────────
// These imports carry zero runtime cost (`import type` is erased).
// The actual modules are loaded lazily via dynamic import inside runFallback().
import type * as DBModule from '../infrastructure/database.js';
import type * as RuleRepoModule from '../infrastructure/ruleRepo.js';
import type * as OrchestratorModule from '../domain/GenerationOrchestrator.js';
import type { AnyRule, GenerationContext } from '../domain/types.js';
import type { FederalState } from '../domain/calendar/WorkingDayCalendar.js';

/** Callback type for generation progress events. */
export type ProgressCallback = (event: GenerationProgressEvent) => void;

// ── WorkerProxy ───────────────────────────────────────────────────────────────

/**
 * Main-thread wrapper for the generation Web Worker.
 *
 * Lifecycle:
 *   1. Construct (or use the exported singleton `workerProxy`).
 *   2. Call `start()` to begin generation; it resolves when done.
 *   3. Call `cancel()` at any time to abort the current run.
 *   4. Call `terminate()` when the proxy is permanently disposed (e.g. on
 *      component unmount) to release the underlying Worker thread.
 */
export class WorkerProxy {
  /** Underlying Worker thread (lazily created on first `start()`). */
  private worker: Worker | null = null;

  /** Controls the in-progress generation; null when idle. */
  private abortController: AbortController | null = null;

  /** True while a generation call is in flight. */
  get isRunning(): boolean {
    return this.abortController !== null;
  }

  /**
   * Start a generation run.
   *
   * Lazily creates the Web Worker on the first call.  Falls back to main-thread
   * execution via `GenerationOrchestrator` when the Worker API is unavailable.
   *
   * @param ruleIds    IDs of the rules to execute (empty array = all enabled rules).
   * @param config     Generation configuration (date range, seed, payment mode…).
   * @param onProgress Callback invoked with progress events throughout the run.
   * @returns Resolves with the generation result when complete.
   *
   * @throws {Error}        If a generation is already in progress.
   * @throws {DOMException} `AbortError`         – cancelled via `cancel()`.
   * @throws {DOMException} `QuotaExceededError` – IndexedDB quota exceeded.
   */
  async start(
    ruleIds: string[],
    config: GenerationConfig,
    onProgress: ProgressCallback,
  ): Promise<GenerationResult> {
    if (this.abortController !== null) {
      throw new Error('WorkerProxy: generation already in progress – call cancel() first.');
    }

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    try {
      if (this.isWorkerSupported()) {
        return await this.runViaWorker(ruleIds, config, onProgress, signal);
      }
      return await this.runFallback(ruleIds, config, onProgress, signal);
    } finally {
      // Always clear so `isRunning` accurately reflects the idle state.
      this.abortController = null;
    }
  }

  /**
   * Cancel the current generation run.
   *
   * Aborts the underlying `AbortController`; the `start()` promise rejects
   * with a `DOMException("AbortError")`.  No-op when nothing is running.
   */
  cancel(): void {
    this.abortController?.abort();
  }

  /**
   * Terminate the underlying Worker thread and release all resources.
   *
   * Call when the `WorkerProxy` is permanently disposed (e.g. on component
   * unmount).  Any in-progress generation is cancelled first.
   */
  terminate(): void {
    this.cancel();
    this.destroyWorker();
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private isWorkerSupported(): boolean {
    return typeof Worker !== 'undefined';
  }

  /**
   * Return the existing Worker or create a new one (lazy initialisation).
   *
   * The URL is resolved relative to this source file so Vite can bundle
   * and content-hash the worker chunk correctly in production.
   */
  private getOrCreateWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/generationWorker.ts', import.meta.url), {
        type: 'module',
      });
    }
    return this.worker;
  }

  /** Terminate and discard the Worker thread (if one exists). */
  private destroyWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  /**
   * Run generation inside the Web Worker (primary path).
   *
   * Uses `Comlink.proxy()` to forward the progress callback across the Worker
   * boundary.  Cancellation terminates the Worker thread directly and rejects
   * the promise with `AbortError` – this is more reliable than attempting to
   * transfer an `AbortSignal` across the thread boundary in all browsers.
   */
  private runViaWorker(
    ruleIds: string[],
    config: GenerationConfig,
    onProgress: ProgressCallback,
    signal: AbortSignal,
  ): Promise<GenerationResult> {
    const worker = this.getOrCreateWorker();
    const api = Comlink.wrap<GenerationWorkerAPI>(worker);

    return new Promise<GenerationResult>((resolve, reject) => {
      // Short-circuit if the caller already aborted before we started.
      if (signal.aborted) {
        reject(new DOMException('Generation aborted', 'AbortError'));
        return;
      }

      const onAbort = (): void => {
        // Terminate the Worker immediately; a new one is created lazily on the
        // next start() call.
        this.destroyWorker();
        reject(new DOMException('Generation aborted', 'AbortError'));
      };

      signal.addEventListener('abort', onAbort, { once: true });

      api
        .generate(ruleIds, config, Comlink.proxy(onProgress))
        .then((result) => {
          signal.removeEventListener('abort', onAbort);
          resolve(result);
        })
        .catch((err: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(err);
        });
    });
  }

  /**
   * Run generation on the main thread (fallback path).
   *
   * Used when the Web Worker API is unavailable (very old browsers, SSR, tests).
   * Mirrors the logic of `generationWorker.ts` but executes on the main thread.
   * For large workloads this may block the UI; prefer the Worker path.
   *
   * Modules are loaded lazily via dynamic import to keep startup cost low and
   * to avoid issues when the infrastructure layer is not yet initialised.
   */
  private async runFallback(
    ruleIds: string[],
    config: GenerationConfig,
    onProgress: ProgressCallback,
    signal: AbortSignal,
  ): Promise<GenerationResult> {
    const [{ db }, { RuleRepo }, { GenerationOrchestrator }] = (await Promise.all([
      import('../infrastructure/database.js'),
      import('../infrastructure/ruleRepo.js'),
      import('../domain/GenerationOrchestrator.js'),
    ])) as [typeof DBModule, typeof RuleRepoModule, typeof OrchestratorModule];

    // Fetch the requested rules from IndexedDB.
    const ruleRepo = new RuleRepo(db);
    const allEntries = await ruleRepo.getAll();
    const filtered =
      ruleIds.length === 0 ? allEntries : allEntries.filter((e) => ruleIds.includes(e.id));

    const rules = filtered.map((e) => e.config as AnyRule);

    // Convert the UI-level GenerationConfig to the domain GenerationContext.
    const context: GenerationContext = {
      startDate: config.startDate,
      endDate: config.endDate,
      paymentMode: config.paymentMode ?? 'sepa',
      federalState: (config.stateCode ?? 'DE-BY') as FederalState,
      globalSeed: config.seed,
    };

    // Run the orchestrator on the main thread with a direct DB write function.
    const orchestrator = new GenerationOrchestrator(async (entries) => {
      await db.transactions.bulkAdd(
        entries as unknown as Parameters<typeof db.transactions.bulkAdd>[0],
      );
    });

    return orchestrator.generate(rules, context, onProgress, signal);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Application-wide `WorkerProxy` singleton.
 *
 * Import this instance throughout the UI layer to share a single Worker thread.
 * Call `workerProxy.terminate()` when the application is torn down.
 */
export const workerProxy = new WorkerProxy();
