/**
 * src/workers/workerTypes.ts
 *
 * Shared type definitions for the generationWorker protocol (P3-04).
 *
 * These types are used by:
 *   - `generationWorker.ts` (worker implementation)
 *   - `__mocks__/generationWorker.ts` (test mock – mirrors these types)
 *   - Main-thread code that wraps the worker with Comlink.wrap()
 */

import type {
  GenerationProgressEvent,
  GenerationResult,
} from '../domain/GenerationOrchestrator.js';

/**
 * Configuration passed to every `generate()` call.
 * Maps 1-to-1 with `GenerationContext` in the domain layer.
 */
export interface GenerationConfig {
  /** ISO-8601 start date, e.g. "2020-01-01". */
  startDate: string;
  /** ISO-8601 end date, e.g. "2024-12-31". */
  endDate: string;
  /** Optional PRNG seed for deterministic output. */
  seed?: number;
  /** Payment mode: "sepa" (default) | "instant". */
  paymentMode?: 'sepa' | 'instant';
  /**
   * ISO 3166-2:DE federal state code, e.g. "DE-BY" for Bavaria.
   * Defaults to "DE-BY" when omitted.
   */
  stateCode?: string;
}

/**
 * The API surface exposed by `generationWorker.ts` via `Comlink.expose()`.
 *
 * On the main thread, obtain a proxy with:
 * ```ts
 * import * as Comlink from 'comlink';
 * const api = Comlink.wrap<GenerationWorkerAPI>(worker);
 * ```
 */
export interface GenerationWorkerAPI {
  /**
   * Run the generation pipeline for the given rule IDs.
   *
   * @param ruleIds    - Rule IDs to execute; empty array executes all rules.
   * @param config     - Shared generation configuration.
   * @param onProgress - Progress callback (wrap with `Comlink.proxy` on main thread).
   * @param signal     - Optional abort signal (wrap with `Comlink.proxy` on main thread).
   * @throws {DOMException} name="AbortError" when signal is aborted.
   * @throws {DOMException} name="QuotaExceededError" when IDB quota is full.
   */
  generate(
    ruleIds: string[],
    config: GenerationConfig,
    onProgress: (event: GenerationProgressEvent) => void,
    signal?: AbortSignal,
  ): Promise<GenerationResult>;
}

// Re-export for convenience.
export type { GenerationProgressEvent, GenerationResult };
