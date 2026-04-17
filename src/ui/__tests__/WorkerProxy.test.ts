/**
 * WorkerProxy unit tests (P3-08)
 *
 * Runs in the Node environment (standard `npm test`).
 *
 * Coverage:
 *   - `start()`: happy path, double-start guard, cancel mid-run,
 *     error propagation (QuotaExceededError)
 *   - `cancel()`: no-op when idle, aborts in-progress run with AbortError
 *   - `terminate()`: tears down Worker; subsequent start() still works
 *   - Lazy Worker initialisation: Worker is NOT created before first start()
 *   - Worker reuse: same Worker instance across multiple runs
 *   - Fallback path: runs GenerationOrchestrator on the main thread when
 *     Worker is unavailable (uses fake-indexeddb, empty rules → 0 transactions)
 *
 * Mocking strategy:
 *   - `vi.mock('comlink', factory)` with a factory that does NOT reference
 *     test-file `let`/`const` variables (avoids Vitest's TDZ hoisting issue).
 *     The mock's `wrap` implementation is configured per-test via `beforeEach`.
 *   - `vi.stubGlobal('Worker', MockWorkerCtor)` makes the Worker path
 *     available in the Node environment.
 *   - Removing the Worker stub exercises the fallback (GenerationOrchestrator).
 *
 * Note: integration against a real Comlink Worker is covered by the
 *   browser test suite in `tests/workers/generationWorker.browser.test.ts`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as ComlinkMock from 'comlink'; // resolved to the mock defined below
import {
  WorkerProxy,
  type GenerationConfig,
  type GenerationProgressEvent,
  type GenerationResult,
} from '../WorkerProxy';
import {
  createFreshWorkerMock,
  createQuotaExceededMock,
} from '../../../__mocks__/generationWorker';

// ── Comlink mock ─────────────────────────────────────────────────────────────
//
// Factory MUST NOT reference test-file let/const variables: Vitest hoists
// vi.mock() above imports, so those variables would be in TDZ when the factory
// executes.  Instead we create plain vi.fn() stubs here and configure their
// implementation per-test in beforeEach via vi.mocked().

vi.mock('comlink', () => ({
  // Identity proxy: in unit tests the callback is in the same thread, so no
  // message-passing infrastructure is needed.
  proxy: (fn: unknown) => fn,
  // wrap is configured in beforeEach to return the current fresh mock API.
  wrap: vi.fn(),
}));

// ── Mock Worker constructor ───────────────────────────────────────────────────

function buildMockWorkerCtor() {
  return vi.fn().mockReturnValue({
    terminate: vi.fn(),
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

// ── Shared fixtures ───────────────────────────────────────────────────────────

const config: GenerationConfig = {
  startDate: '2020-01-01',
  endDate: '2024-12-31',
  seed: 42,
  paymentMode: 'sepa',
  stateCode: 'AT-9',
};

const ruleIds = ['rule-1', 'rule-2', 'rule-3'];

const noop = () => {};

// ── Helper: make a never-resolving mock API ──────────────────────────────────

function makePendingApi(): {
  api: { generate: ReturnType<typeof vi.fn> };
  resolve: () => void;
} {
  let resolveRef!: (result: GenerationResult) => void;
  return {
    api: {
      generate: vi.fn(
        () =>
          new Promise<GenerationResult>((res) => {
            resolveRef = res;
          }),
      ),
    },
    get resolve() {
      return () => resolveRef({ transactionCount: 0, durationMs: 0 });
    },
  };
}

// ── Tests: Worker path (Worker API available) ─────────────────────────────────

describe('WorkerProxy – Worker path (P3-08)', () => {
  let MockWorkerCtor: ReturnType<typeof buildMockWorkerCtor>;
  let proxy: WorkerProxy;

  beforeEach(() => {
    // Fresh mock API for each test.
    vi.mocked(ComlinkMock.wrap).mockReturnValue(
      createFreshWorkerMock() as unknown as ReturnType<typeof ComlinkMock.wrap>,
    );

    // Provide a mock Worker constructor so isWorkerSupported() returns true.
    MockWorkerCtor = buildMockWorkerCtor();
    vi.stubGlobal('Worker', MockWorkerCtor);

    proxy = new WorkerProxy();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    proxy.terminate();
  });

  it('start() resolves with the generation result', async () => {
    const result = await proxy.start(ruleIds, config, noop);

    expect(result).toEqual({ transactionCount: 3, durationMs: 0 });
  });

  it('start() passes ruleIds and config to the underlying worker API', async () => {
    await proxy.start(ruleIds, config, noop);

    const wrappedApi = vi.mocked(ComlinkMock.wrap).mock.results[0].value as ReturnType<
      typeof createFreshWorkerMock
    >;
    expect(wrappedApi.generate).toHaveBeenCalledOnce();
    expect(wrappedApi.generate).toHaveBeenCalledWith(ruleIds, config, expect.any(Function));
  });

  it('start() forwards progress events to the caller', async () => {
    const events: GenerationProgressEvent[] = [];

    await proxy.start(ruleIds, config, (e) => events.push(e));

    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ processed: 1, total: 3 });
    expect(events[2]).toMatchObject({ processed: 3, total: 3, percentage: 100 });
  });

  it('Worker is lazily initialised – not created before start()', () => {
    expect(MockWorkerCtor).not.toHaveBeenCalled();
  });

  it('Worker is created on the first start() call', async () => {
    expect(MockWorkerCtor).not.toHaveBeenCalled();

    await proxy.start(ruleIds, config, noop);

    expect(MockWorkerCtor).toHaveBeenCalledOnce();
  });

  it('Worker instance is reused across consecutive start() calls', async () => {
    await proxy.start(ruleIds, config, noop);

    // Restore a working API for the second call.
    vi.mocked(ComlinkMock.wrap).mockReturnValue(
      createFreshWorkerMock() as unknown as ReturnType<typeof ComlinkMock.wrap>,
    );

    await proxy.start(ruleIds, config, noop);

    // Worker constructor should have been called only once.
    expect(MockWorkerCtor).toHaveBeenCalledOnce();
  });

  it('isRunning is false when idle', () => {
    expect(proxy.isRunning).toBe(false);
  });

  it('isRunning is false after start() resolves', async () => {
    await proxy.start(ruleIds, config, noop);

    expect(proxy.isRunning).toBe(false);
  });

  it('start() throws when called while another generation is already running', async () => {
    const pending = makePendingApi();
    vi.mocked(ComlinkMock.wrap).mockReturnValue(
      pending.api as unknown as ReturnType<typeof ComlinkMock.wrap>,
    );

    const first = proxy.start(ruleIds, config, noop);

    await expect(proxy.start(ruleIds, config, noop)).rejects.toThrow('already in progress');

    pending.resolve();
    await first;
  });

  it('cancel() is a no-op when nothing is running', () => {
    expect(() => proxy.cancel()).not.toThrow();
  });

  it('cancel() is a no-op after start() has already resolved', async () => {
    await proxy.start(ruleIds, config, noop);

    expect(() => proxy.cancel()).not.toThrow();
  });

  it('cancel() rejects the in-progress start() with AbortError', async () => {
    const pending = makePendingApi();
    vi.mocked(ComlinkMock.wrap).mockReturnValue(
      pending.api as unknown as ReturnType<typeof ComlinkMock.wrap>,
    );

    const promise = proxy.start(ruleIds, config, noop);
    proxy.cancel();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('isRunning is false after a cancelled run', async () => {
    const pending = makePendingApi();
    vi.mocked(ComlinkMock.wrap).mockReturnValue(
      pending.api as unknown as ReturnType<typeof ComlinkMock.wrap>,
    );

    const promise = proxy.start(ruleIds, config, noop);
    proxy.cancel();
    await promise.catch(() => {});

    expect(proxy.isRunning).toBe(false);
  });

  it('cancel() destroys the Worker so next start() creates a fresh instance', async () => {
    const pending = makePendingApi();
    vi.mocked(ComlinkMock.wrap).mockReturnValue(
      pending.api as unknown as ReturnType<typeof ComlinkMock.wrap>,
    );

    const promise = proxy.start(ruleIds, config, noop);
    proxy.cancel();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });

    // Restore a working API for the next run.
    vi.mocked(ComlinkMock.wrap).mockReturnValue(
      createFreshWorkerMock() as unknown as ReturnType<typeof ComlinkMock.wrap>,
    );

    // A new Worker must be created because cancel() terminated the old one.
    await proxy.start(ruleIds, config, noop);
    expect(MockWorkerCtor).toHaveBeenCalledTimes(2);
  });

  it('QuotaExceededError from the worker API is propagated to the caller', async () => {
    vi.mocked(ComlinkMock.wrap).mockReturnValue(
      createQuotaExceededMock(0) as unknown as ReturnType<typeof ComlinkMock.wrap>,
    );

    await expect(proxy.start(ruleIds, config, noop)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
  });

  it('isRunning is false after a failed start()', async () => {
    vi.mocked(ComlinkMock.wrap).mockReturnValue(
      createQuotaExceededMock(0) as unknown as ReturnType<typeof ComlinkMock.wrap>,
    );

    await proxy.start(ruleIds, config, noop).catch(() => {});

    expect(proxy.isRunning).toBe(false);
  });

  it('terminate() calls terminate() on the underlying Worker thread', async () => {
    await proxy.start(ruleIds, config, noop);

    const workerInstance = MockWorkerCtor.mock.results[0].value as {
      terminate: ReturnType<typeof vi.fn>;
    };

    proxy.terminate();

    expect(workerInstance.terminate).toHaveBeenCalledOnce();
  });

  it('terminate() allows subsequent start() calls with a new Worker', async () => {
    await proxy.start(ruleIds, config, noop);
    proxy.terminate();

    // Restore a working API for the next run.
    vi.mocked(ComlinkMock.wrap).mockReturnValue(
      createFreshWorkerMock() as unknown as ReturnType<typeof ComlinkMock.wrap>,
    );

    const result = await proxy.start(ruleIds, config, noop);
    expect(result.transactionCount).toBe(3);
    // Second Worker was created after the first was terminated.
    expect(MockWorkerCtor).toHaveBeenCalledTimes(2);
  });
});

// ── Tests: Fallback path (Worker API unavailable) ────────────────────────────
//
// When Worker is not available, WorkerProxy falls back to running
// GenerationOrchestrator directly on the main thread.  In the test environment
// (Node + fake-indexeddb), the IDB starts empty (no rules), so the orchestrator
// completes immediately with 0 transactions.

describe('WorkerProxy – fallback path (P3-08)', () => {
  let proxy: WorkerProxy;

  beforeEach(() => {
    // Remove Worker from the global scope so isWorkerSupported() returns false.
    vi.stubGlobal('Worker', undefined);
    proxy = new WorkerProxy();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('start() succeeds via GenerationOrchestrator when Worker is unavailable', async () => {
    // With an empty DB there are 0 rules → orchestrator returns immediately.
    const result = await proxy.start(ruleIds, config, noop);

    expect(result).toMatchObject({ transactionCount: 0 });
    expect(typeof result.durationMs).toBe('number');
  });

  it('isRunning is false after fallback completes', async () => {
    await proxy.start(ruleIds, config, noop).catch(() => {});

    expect(proxy.isRunning).toBe(false);
  });

  it('cancel() does not throw in the fallback path', async () => {
    // cancel() must be a no-op here: the fallback may complete before the abort
    // is processed (empty DB → 0 rules → 0-iteration loop).
    const promise = proxy.start(ruleIds, config, noop);
    expect(() => proxy.cancel()).not.toThrow();
    // Wait for the run to settle (may resolve or reject depending on timing).
    await promise.catch(() => {});
  });
});
