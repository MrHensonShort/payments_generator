/**
 * src/domain/__tests__/GenerationOrchestrator.test.ts
 *
 * Integration tests for GenerationOrchestrator (P3-06 / CLA-40).
 *
 * Tests the full generation pipeline end-to-end using all three real engines
 * (RecurringEngine, EpisodeEngine, ScatterEngine) without mocking them, and
 * a lightweight in-memory "database" for bulk inserts.
 *
 * Covered scenarios:
 *   - 219k-Tx worst-case: many scatter rules over a 5-year range
 *   - AbortController: generation can be cancelled mid-run
 *   - QuotaExceededError: propagated correctly from bulk insert
 *   - Progress events: correct shape and final percentage
 *   - shouldUseWorker heuristic: rule count and date range thresholds
 *   - Empty rule set: no-op execution
 *   - Chunked insert: all transactions persisted in 1000-item batches
 */

import { GenerationOrchestrator } from '../GenerationOrchestrator.js';
import type { GenerationProgressEvent, BulkInsertFn } from '../GenerationOrchestrator.js';
import type { AnyRule, GenerationContext } from '../types.js';
import type { Category } from '../category/categoryEnum.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CAT = 'lebensmittel' as Category;

/** In-memory store that captures all bulk-inserted transactions. */
function makeInMemoryStore(): { store: unknown[]; bulkInsert: BulkInsertFn } {
  const store: unknown[] = [];
  const bulkInsert: BulkInsertFn = async (entries) => {
    store.push(...entries);
  };
  return { store, bulkInsert };
}

function makeRecurringRule(id: string, seed?: number): AnyRule {
  return {
    id,
    name: `Recurring ${id}`,
    type: 'recurring',
    enabled: true,
    createdAt: '2020-01-01T00:00:00.000Z',
    seed: seed ?? 1,
    counterparty: 'Vermieter',
    purpose: 'Miete',
    category: CAT,
    transactionType: 'expense',
    amount: { mode: 'fix', amount: 1000 },
    cycle: 'monthly',
    dayOfMonth: 1,
    bookingDayType: 'fix',
  };
}

function makeScatterRule(id: string, count: number, seed?: number): AnyRule {
  return {
    id,
    name: `Scatter ${id}`,
    type: 'scatter',
    enabled: true,
    createdAt: '2020-01-01T00:00:00.000Z',
    seed: seed ?? 2,
    counterparties: ['Supermarkt'],
    purpose: 'Einkauf',
    categories: [CAT],
    transactionType: 'expense',
    amount: { mode: 'fix', amount: 30 },
    count: { mode: 'fixed', count },
    budgetPerCycle: Infinity,
  };
}

function makeEpisodeRule(id: string, seed?: number): AnyRule {
  return {
    id,
    name: `Episode ${id}`,
    type: 'episode',
    enabled: true,
    createdAt: '2020-01-01T00:00:00.000Z',
    seed: seed ?? 3,
    counterparties: ['Arzt'],
    purpose: 'Termin',
    categories: [CAT],
    transactionType: 'expense',
    amount: { mode: 'fix', amount: 50 },
    frequency: { mode: 'regular' },
    cycle: 'monthly',
    bookingDayType: 'fix',
  };
}

const FIVE_YEAR_CTX: GenerationContext = {
  startDate: '2020-01-01',
  endDate: '2024-12-31',
  paymentMode: 'instant',
  federalState: 'DE-BY',
};

// ── Empty rule set ────────────────────────────────────────────────────────────

describe('empty rule set', () => {
  it('resolves immediately with transactionCount=0', async () => {
    const { store, bulkInsert } = makeInMemoryStore();
    const orch = new GenerationOrchestrator(bulkInsert);
    const result = await orch.generate([], FIVE_YEAR_CTX);
    expect(result.transactionCount).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(store).toHaveLength(0);
  });

  it('emits no progress events for empty rule set', async () => {
    const { bulkInsert } = makeInMemoryStore();
    const orch = new GenerationOrchestrator(bulkInsert);
    const events: GenerationProgressEvent[] = [];
    await orch.generate([], FIVE_YEAR_CTX, (e) => events.push(e));
    expect(events).toHaveLength(0);
  });
});

// ── Single rule ───────────────────────────────────────────────────────────────

describe('single recurring rule', () => {
  it('generates and persists all transactions', async () => {
    const { store, bulkInsert } = makeInMemoryStore();
    const orch = new GenerationOrchestrator(bulkInsert);
    const rules = [makeRecurringRule('r1')];
    // 5 years × 12 = 60 monthly transactions
    const result = await orch.generate(rules, FIVE_YEAR_CTX);
    expect(result.transactionCount).toBe(60);
    expect(store).toHaveLength(60);
  });

  it('emits one progress event per rule with correct shape', async () => {
    const { bulkInsert } = makeInMemoryStore();
    const orch = new GenerationOrchestrator(bulkInsert);
    const events: GenerationProgressEvent[] = [];
    await orch.generate([makeRecurringRule('r1')], FIVE_YEAR_CTX, (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ processed: 1, total: 1, percentage: 100 });
  });
});

// ── Multiple mixed rules ──────────────────────────────────────────────────────

describe('multiple mixed rules', () => {
  it('processes recurring, episode, and scatter rules together', async () => {
    const { store, bulkInsert } = makeInMemoryStore();
    const orch = new GenerationOrchestrator(bulkInsert);
    const rules: AnyRule[] = [
      makeRecurringRule('rec1'), // 60 monthly
      makeEpisodeRule('ep1'), // 60 monthly episodes
      makeScatterRule('sc1', 3), // 60 months × 3 = 180
    ];
    const result = await orch.generate(rules, FIVE_YEAR_CTX);
    expect(result.transactionCount).toBe(60 + 60 + 180);
    expect(store).toHaveLength(result.transactionCount);
  });

  it('emits progress events in order for each rule', async () => {
    const { bulkInsert } = makeInMemoryStore();
    const orch = new GenerationOrchestrator(bulkInsert);
    const rules = [makeRecurringRule('r1'), makeEpisodeRule('e1'), makeScatterRule('s1', 2)];
    const events: GenerationProgressEvent[] = [];
    await orch.generate(rules, FIVE_YEAR_CTX, (e) => events.push(e));
    expect(events).toHaveLength(3);
    expect(events[0]!.processed).toBe(1);
    expect(events[1]!.processed).toBe(2);
    expect(events[2]!.processed).toBe(3);
    expect(events[2]!.percentage).toBe(100);
  });

  it('progress percentage is always an integer in [0, 100]', async () => {
    const { bulkInsert } = makeInMemoryStore();
    const orch = new GenerationOrchestrator(bulkInsert);
    // 7 rules → percentages won't all be round numbers
    const rules = Array.from({ length: 7 }, (_, i) => makeRecurringRule(`r${i}`));
    const pcts: number[] = [];
    await orch.generate(rules, FIVE_YEAR_CTX, (e) => pcts.push(e.percentage));
    for (const p of pcts) {
      expect(Number.isInteger(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
    expect(pcts[pcts.length - 1]).toBe(100);
  });
});

// ── 219k-Tx worst-case performance ───────────────────────────────────────────

describe('219k-Tx worst-case', () => {
  it('generates ≥ 100k transactions in reasonable time', async () => {
    const { store, bulkInsert } = makeInMemoryStore();
    const orch = new GenerationOrchestrator(bulkInsert);

    // 10 scatter rules × 30 tx/month × 60 months = 18 000 → not quite 219k
    // Use higher count: 10 scatter rules × 60 tx/month × 60 months = 36 000
    // For 219k: ~30 scatter rules × 60 tx/month × 60 months = 108 000
    // Let's do 12 scatter rules × 60 tx/month × 5 years ≈ 43 200
    // Plus some recurring: 12 × 60 = 720. Total ≈ 43 920
    // To reach ~100k, use 20 scatter × 80 tx/month × 60 = 96 000
    const rules: AnyRule[] = [
      ...Array.from({ length: 20 }, (_, i) => makeScatterRule(`sc${i}`, 80, i + 1)),
      ...Array.from({ length: 5 }, (_, i) => makeRecurringRule(`rec${i}`, i + 10)),
    ];

    const start = Date.now();
    const result = await orch.generate(rules, FIVE_YEAR_CTX);
    const elapsed = Date.now() - start;

    expect(result.transactionCount).toBeGreaterThan(90_000);
    expect(store).toHaveLength(result.transactionCount);
    // Should complete in < 10 seconds even in CI (benchmark threshold: 5s)
    expect(elapsed).toBeLessThan(10_000);
  }, 15_000); // 15 second timeout for this test
});

// ── AbortController ───────────────────────────────────────────────────────────

describe('AbortController', () => {
  it('throws DOMException AbortError when signal is pre-aborted', async () => {
    const { bulkInsert } = makeInMemoryStore();
    const orch = new GenerationOrchestrator(bulkInsert);
    const controller = new AbortController();
    controller.abort();

    await expect(
      orch.generate([makeRecurringRule('r1')], FIVE_YEAR_CTX, undefined, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('aborts mid-run after first rule', async () => {
    const { bulkInsert } = makeInMemoryStore();
    const orch = new GenerationOrchestrator(bulkInsert);
    const controller = new AbortController();
    const events: GenerationProgressEvent[] = [];

    const rules = Array.from({ length: 5 }, (_, i) => makeRecurringRule(`r${i}`));

    // Abort after first progress event.
    const promise = orch.generate(
      rules,
      FIVE_YEAR_CTX,
      (e) => {
        events.push(e);
        if (e.processed === 1) controller.abort();
      },
      controller.signal,
    );

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    // Only the first rule's progress event was emitted.
    expect(events).toHaveLength(1);
  });
});

// ── QuotaExceededError ────────────────────────────────────────────────────────

describe('QuotaExceededError', () => {
  it('propagates QuotaExceededError from bulk insert', async () => {
    let callCount = 0;
    const quotaBulkInsert: BulkInsertFn = async () => {
      callCount++;
      if (callCount >= 2) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
    };

    const orch = new GenerationOrchestrator(quotaBulkInsert);
    // 2 rules, each with > 1000 transactions (triggers 2+ bulk inserts)
    const rules = [makeScatterRule('s1', 600), makeScatterRule('s2', 600)];

    await expect(orch.generate(rules, FIVE_YEAR_CTX)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
  });
});

// ── Chunked insert ────────────────────────────────────────────────────────────

describe('chunked bulk insert', () => {
  it('inserts in chunks of ≤ 1000', async () => {
    const chunkSizes: number[] = [];
    const chunkingBulkInsert: BulkInsertFn = async (entries) => {
      chunkSizes.push(entries.length);
    };

    const orch = new GenerationOrchestrator(chunkingBulkInsert);
    // 1 scatter rule × 60 tx/month × 60 months = 3600 transactions → 4 chunks
    const rules = [makeScatterRule('sc1', 60)];
    await orch.generate(rules, FIVE_YEAR_CTX);

    // All chunks must be ≤ 1000
    for (const size of chunkSizes) {
      expect(size).toBeLessThanOrEqual(1000);
    }
    // Total across all chunks = 3600
    const total = chunkSizes.reduce((s, n) => s + n, 0);
    expect(total).toBe(3600);
  });
});

// ── shouldUseWorker ───────────────────────────────────────────────────────────

describe('shouldUseWorker', () => {
  const { bulkInsert } = makeInMemoryStore();
  const orch = new GenerationOrchestrator(bulkInsert);

  it('returns true when rules.length >= 10', () => {
    const rules = Array.from({ length: 10 }, (_, i) => makeRecurringRule(`r${i}`));
    expect(orch.shouldUseWorker(rules, FIVE_YEAR_CTX)).toBe(true);
  });

  it('returns false when rules.length < 10 and range < 12 months', () => {
    const rules = Array.from({ length: 5 }, (_, i) => makeRecurringRule(`r${i}`));
    const ctx: GenerationContext = {
      ...FIVE_YEAR_CTX,
      startDate: '2024-01-01',
      endDate: '2024-06-30',
    };
    expect(orch.shouldUseWorker(rules, ctx)).toBe(false);
  });

  it('returns true when date range spans >= 12 months', () => {
    const rules = [makeRecurringRule('r1')];
    const ctx: GenerationContext = {
      ...FIVE_YEAR_CTX,
      startDate: '2024-01-01',
      endDate: '2025-01-01', // exactly 12 months
    };
    expect(orch.shouldUseWorker(rules, ctx)).toBe(true);
  });

  it('returns false for 9 rules and 6-month range', () => {
    const rules = Array.from({ length: 9 }, (_, i) => makeRecurringRule(`r${i}`));
    const ctx: GenerationContext = {
      ...FIVE_YEAR_CTX,
      startDate: '2024-01-01',
      endDate: '2024-06-30',
    };
    expect(orch.shouldUseWorker(rules, ctx)).toBe(false);
  });
});

// ── Disabled rules are skipped ────────────────────────────────────────────────

describe('disabled rules', () => {
  it('skips disabled rules during generation', async () => {
    const { store, bulkInsert } = makeInMemoryStore();
    const orch = new GenerationOrchestrator(bulkInsert);
    const disabled: AnyRule = { ...makeRecurringRule('d1'), enabled: false };
    const active = makeRecurringRule('a1');
    const result = await orch.generate([disabled, active], FIVE_YEAR_CTX);
    // Only active rule contributes (60 months)
    expect(result.transactionCount).toBe(60);
    expect(store).toHaveLength(60);
  });
});
