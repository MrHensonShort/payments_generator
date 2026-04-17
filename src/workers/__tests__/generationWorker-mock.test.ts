/**
 * generationWorker-mock.test.ts
 *
 * Demonstrates and verifies the Comlink mock for generationWorker (TR-04).
 *
 * This file serves two purposes:
 *  1. Prove that the mock is correctly structured and usable in Node/jsdom tests
 *     (i.e., no real Worker is spawned; all logic runs in-process).
 *  2. Document the canonical patterns for using the mock in future test files
 *     (GenerationOrchestrator tests, WorkerProxy tests, etc.).
 *
 * ── Canonical usage in other test files ─────────────────────────────────────
 *
 *  Option A – automatic mock resolution (Vitest reads __mocks__ automatically):
 *  ```ts
 *  vi.mock('../../workers/generationWorker');
 *  import { mockGenerationWorkerAPI } from '__mocks__/generationWorker';
 *  ```
 *
 *  Option B – explicit factory (preferred for clarity):
 *  ```ts
 *  import {
 *    mockGenerationWorkerAPI,
 *    createFreshWorkerMock,
 *    createQuotaExceededMock,
 *    type GenerationWorkerAPI,
 *  } from '__mocks__/generationWorker';
 *  ```
 */

import {
  mockGenerationWorkerAPI,
  createFreshWorkerMock,
  createQuotaExceededMock,
  type GenerationProgressEvent,
  type GenerationConfig,
} from '../../../__mocks__/generationWorker';

// ── Shared config fixture ────────────────────────────────────────────────────

const config: GenerationConfig = {
  startDate: '2020-01-01',
  endDate: '2024-12-31',
  seed: 42,
  paymentMode: 'sepa',
  stateCode: 'AT-9',
};

// ── Tests: mockGenerationWorkerAPI (shared spy instance) ─────────────────────

describe('mockGenerationWorkerAPI (TR-04)', () => {
  beforeEach(() => {
    // Reset spy call history between tests.
    vi.clearAllMocks();
  });

  it('generate() resolves with transactionCount equal to ruleIds.length', async () => {
    const ruleIds = ['rule-1', 'rule-2', 'rule-3'];
    const result = await mockGenerationWorkerAPI.generate(ruleIds, config, () => {});

    expect(result.transactionCount).toBe(3);
    expect(result.durationMs).toBe(0);
  });

  it('generate() emits one progress event per rule ID', async () => {
    const ruleIds = ['r-a', 'r-b', 'r-c', 'r-d'];
    const events: GenerationProgressEvent[] = [];

    await mockGenerationWorkerAPI.generate(ruleIds, config, (e) => {
      events.push(e);
    });

    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({ processed: 1, total: 4, percentage: 25 });
    expect(events[3]).toEqual({ processed: 4, total: 4, percentage: 100 });
  });

  it('progress percentages are integers between 0 and 100', async () => {
    const ruleIds = Array.from({ length: 7 }, (_, i) => `rule-${i}`);
    const percentages: number[] = [];

    await mockGenerationWorkerAPI.generate(ruleIds, config, (e) => {
      percentages.push(e.percentage);
    });

    for (const pct of percentages) {
      expect(Number.isInteger(pct)).toBe(true);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
    expect(percentages[percentages.length - 1]).toBe(100);
  });

  it('generate() is a vi.fn() spy – call assertions work', async () => {
    const ruleIds = ['rule-x'];
    await mockGenerationWorkerAPI.generate(ruleIds, config, () => {});

    expect(mockGenerationWorkerAPI.generate).toHaveBeenCalledOnce();
    // signal was not passed, so the spy records 3 args (no undefined 4th element).
    expect(mockGenerationWorkerAPI.generate).toHaveBeenCalledWith(
      ruleIds,
      config,
      expect.any(Function),
    );
  });

  it('empty ruleIds resolves immediately with transactionCount 0', async () => {
    const result = await mockGenerationWorkerAPI.generate([], config, () => {});
    expect(result.transactionCount).toBe(0);
  });
});

// ── Tests: AbortSignal handling ───────────────────────────────────────────────

describe('abort via AbortSignal (TR-04)', () => {
  it('throws DOMException AbortError when signal is pre-aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const worker = createFreshWorkerMock();

    await expect(
      worker.generate(['rule-1', 'rule-2'], config, () => {}, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('throws AbortError mid-run when signal is aborted after first event', async () => {
    const controller = new AbortController();
    const worker = createFreshWorkerMock();
    const events: GenerationProgressEvent[] = [];

    // Abort after we receive the first progress event.
    const promise = worker.generate(
      ['r-1', 'r-2', 'r-3'],
      config,
      (e) => {
        events.push(e);
        if (e.processed === 1) controller.abort();
      },
      controller.signal,
    );

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    // Only the first event was emitted before the abort.
    expect(events).toHaveLength(1);
  });
});

// ── Tests: createFreshWorkerMock ──────────────────────────────────────────────

describe('createFreshWorkerMock (TR-04)', () => {
  beforeEach(() => {
    // Clear the shared spy so previous describe-block calls don't pollute assertions.
    vi.clearAllMocks();
  });

  it('returns an independent spy not shared with mockGenerationWorkerAPI', async () => {
    const fresh = createFreshWorkerMock();
    await fresh.generate(['x'], config, () => {});

    // The shared spy must not have been called.
    expect(mockGenerationWorkerAPI.generate).not.toHaveBeenCalled();
    expect(fresh.generate).toHaveBeenCalledOnce();
  });

  it('spy call history is clean on each createFreshWorkerMock() call', async () => {
    const a = createFreshWorkerMock();
    await a.generate(['rule-a'], config, () => {});

    const b = createFreshWorkerMock();
    // b is a new instance – its spy has zero calls.
    expect(b.generate).not.toHaveBeenCalled();
  });
});

// ── Tests: createQuotaExceededMock ────────────────────────────────────────────

describe('createQuotaExceededMock (TR-04)', () => {
  it('throws QuotaExceededError on the first rule when triggerAfter=0', async () => {
    const mock = createQuotaExceededMock(0);

    await expect(mock.generate(['rule-1', 'rule-2'], config, () => {})).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
  });

  it('emits progress events up to triggerAfter before throwing', async () => {
    const mock = createQuotaExceededMock(2);
    const events: GenerationProgressEvent[] = [];

    await expect(
      mock.generate(['r1', 'r2', 'r3', 'r4'], config, (e) => events.push(e)),
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });

    // Events for i=0 and i=1 were emitted before the quota error at i=2.
    expect(events).toHaveLength(2);
    expect(events[0].processed).toBe(1);
    expect(events[1].processed).toBe(2);
  });

  it('respects AbortSignal even before the quota threshold', async () => {
    const controller = new AbortController();
    controller.abort();
    const mock = createQuotaExceededMock(10);

    await expect(mock.generate(['r1'], config, () => {}, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
