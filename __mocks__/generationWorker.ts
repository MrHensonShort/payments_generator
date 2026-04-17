/**
 * __mocks__/generationWorker.ts
 *
 * Comlink mock for generationWorker – TR-04 Web-Worker-Teststrategie
 * ──────────────────────────────────────────────────────────────────
 * PURPOSE
 *   Provides an in-process, synchronous stand-in for the real
 *   `src/workers/generationWorker.ts` (implemented in Phase 3, P3-04).
 *   Unit tests import this mock instead of spawning an actual Web Worker,
 *   making them fast, deterministic, and runnable in Node/jsdom.
 *
 * HOW VITEST PICKS IT UP
 *   In your test file call:
 *     vi.mock('../../workers/generationWorker');
 *   Vitest will resolve the import to this file automatically.
 *   Alternatively, pass the factory explicitly:
 *     vi.mock('../../workers/generationWorker', () => mockGenerationWorkerModule());
 *
 * WHEN THE REAL WORKER IS NEEDED
 *   For integration tests against the actual Web Worker, use
 *   `vitest.browser.config.ts` and the `tests/workers/` suite.
 *   Do NOT use this mock for those tests.
 */

// ── Types (mirror the real generationWorker API) ─────────────────────────────

/**
 * Progress event emitted by the worker during generation.
 * Matches the `progress` message defined in P3-04.
 */
export interface GenerationProgressEvent {
  /** Number of transactions processed so far. */
  processed: number;
  /** Total transactions to be generated. */
  total: number;
  /** Progress as an integer 0–100. */
  percentage: number;
}

/** Final result returned when generation completes (`done` message). */
export interface GenerationResult {
  /** Total number of transactions written to IndexedDB. */
  transactionCount: number;
  /** Wall-clock time in milliseconds from start to completion. */
  durationMs: number;
}

/** Shared configuration passed to every generation request. */
export interface GenerationConfig {
  /** ISO-8601 date string, e.g. "2020-01-01". */
  startDate: string;
  /** ISO-8601 date string, e.g. "2024-12-31". */
  endDate: string;
  /** Optional PRNG seed for deterministic output. */
  seed?: number;
  /** Payment mode: "sepa" | "instant". Defaults to "sepa". */
  paymentMode?: 'sepa' | 'instant';
  /** ISO 3166-2:AT sub-region code, e.g. "AT-9" for Vienna. */
  stateCode?: string;
}

/**
 * The API surface exposed by `generationWorker.ts` via `Comlink.expose()`.
 * Tests that use this mock work against this interface.
 */
export interface GenerationWorkerAPI {
  /**
   * Run the generation pipeline for the given rule IDs.
   *
   * @param ruleIds    IDs of the rules to execute.
   * @param config     Shared generation configuration.
   * @param onProgress Callback invoked periodically with progress events.
   *                   In real Comlink usage this must be wrapped with
   *                   `Comlink.proxy(callback)` on the main thread.
   * @param signal     Optional `AbortSignal` to cancel the operation.
   *                   Rejection type: `DOMException` with name "AbortError".
   * @throws {DOMException} name="AbortError" when aborted via signal.
   * @throws {DOMException} name="QuotaExceededError" when IDB quota is full.
   */
  generate(
    ruleIds: string[],
    config: GenerationConfig,
    onProgress: (event: GenerationProgressEvent) => void,
    signal?: AbortSignal,
  ): Promise<GenerationResult>;
}

// ── Shared implementation (not a spy) ────────────────────────────────────────

/**
 * Core generate logic used by both the shared mock and fresh mocks.
 * Extracted as a plain function so `createFreshWorkerMock()` never routes
 * calls through `mockGenerationWorkerAPI.generate`, keeping spy call counts
 * isolated between the shared instance and any fresh instances.
 */
async function generateImpl(
  ruleIds: string[],
  _config: GenerationConfig,
  onProgress: (event: GenerationProgressEvent) => void,
  signal?: AbortSignal,
): Promise<GenerationResult> {
  const total = ruleIds.length;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      throw new DOMException('Generation aborted', 'AbortError');
    }
    onProgress({
      processed: i + 1,
      total,
      percentage: Math.round(((i + 1) / total) * 100),
    });
  }

  return { transactionCount: total, durationMs: 0 };
}

// ── Default mock implementation ───────────────────────────────────────────────

/**
 * In-process implementation of `GenerationWorkerAPI`.
 *
 * Behaviour:
 *   - Emits one progress event per rule ID (synthetic, deterministic).
 *   - Respects `signal.aborted` between steps (throws AbortError when set).
 *   - Does NOT touch IndexedDB – keeps unit tests side-effect free.
 *   - Returns `durationMs: 0` (no real async I/O).
 *
 * Spy-friendly: every method is a `vi.fn()` wrapper so you can assert calls:
 *   expect(mockGenerationWorkerAPI.generate).toHaveBeenCalledWith(...)
 */
export const mockGenerationWorkerAPI: GenerationWorkerAPI = {
  generate: vi.fn(generateImpl),
};

// ── Module factory helpers ────────────────────────────────────────────────────

/**
 * Returns a Vitest module factory object for use with `vi.mock()`.
 *
 * Usage:
 * ```ts
 * vi.mock('../../workers/generationWorker', () => mockGenerationWorkerModule());
 * ```
 *
 * The `default` export mirrors what the real module re-exports for convenience
 * (the actual exposed API lives inside the Worker; Comlink.wrap() is done in
 * the WorkerProxy wrapper – P3-08).
 */
export function mockGenerationWorkerModule(): {
  mockGenerationWorkerAPI: GenerationWorkerAPI;
} {
  return { mockGenerationWorkerAPI };
}

/**
 * Creates a fresh `mockGenerationWorkerAPI` instance with reset `vi.fn()` spies.
 * Call this in `beforeEach` when you need isolated spy state across tests.
 *
 * Each fresh mock uses `generateImpl` directly — it does NOT wrap the shared
 * `mockGenerationWorkerAPI.generate` spy, so calls to fresh mocks never show up
 * in `mockGenerationWorkerAPI.generate` call history.
 *
 * ```ts
 * let workerMock: GenerationWorkerAPI;
 *
 * beforeEach(() => {
 *   workerMock = createFreshWorkerMock();
 * });
 * ```
 */
export function createFreshWorkerMock(): GenerationWorkerAPI {
  return {
    generate: vi.fn(generateImpl),
  };
}

/**
 * Utility: create a mock that throws `QuotaExceededError` after `triggerAfter`
 * transactions, simulating full IndexedDB storage (P3-04 error handling).
 *
 * ```ts
 * const quotaMock = createQuotaExceededMock(5);
 * await expect(quotaMock.generate(['r1'], config, noop)).rejects.toMatchObject({
 *   name: 'QuotaExceededError',
 * });
 * ```
 */
export function createQuotaExceededMock(triggerAfter = 0): GenerationWorkerAPI {
  return {
    generate: vi.fn(
      async (
        ruleIds: string[],
        _config: GenerationConfig,
        onProgress: (event: GenerationProgressEvent) => void,
        signal?: AbortSignal,
      ): Promise<GenerationResult> => {
        const total = ruleIds.length;

        for (let i = 0; i < total; i++) {
          if (signal?.aborted) {
            throw new DOMException('Generation aborted', 'AbortError');
          }
          if (i >= triggerAfter) {
            throw new DOMException('IndexedDB quota exceeded', 'QuotaExceededError');
          }
          onProgress({
            processed: i + 1,
            total,
            percentage: Math.round(((i + 1) / total) * 100),
          });
        }

        return { transactionCount: triggerAfter, durationMs: 0 };
      },
    ),
  };
}
