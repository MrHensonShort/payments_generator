/**
 * src/domain/__tests__/ScatterEngine.test.ts
 *
 * Unit tests for ScatterEngine (P3-05 / CLA-39).
 *
 * Coverage targets (CLA-39):
 *   - Deterministic output with seed (E-03)
 *   - Budget compliance (SZ-02)
 *   - CountConfig: fixed and range modes
 *   - Random date and time within valid range
 *   - Disabled rule emits no transactions
 *   - Multi-category and multi-counterparty selection
 *   - Purpose template {n} substitution
 *   - Sign convention (income / expense / transfer)
 *   - Date boundary clipping
 */

import { ScatterEngine } from '../ScatterEngine.js';
import type { ScatterRule, GenerationContext } from '../types.js';
import type { Category } from '../category/categoryEnum.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CAT_A = 'lebensmittel' as Category;
const CAT_B = 'restaurant' as Category;

function makeRule(overrides: Partial<ScatterRule> = {}): ScatterRule {
  return {
    id: 'rule-sc-1',
    name: 'Test Scatter',
    type: 'scatter',
    enabled: true,
    createdAt: '2020-01-01T00:00:00.000Z',
    seed: 42,
    counterparties: ['Markt', 'Bäcker'],
    purpose: 'Kauf {n}',
    categories: [CAT_A],
    transactionType: 'expense',
    amount: { mode: 'fix', amount: 20 },
    count: { mode: 'fixed', count: 5 },
    budgetPerCycle: Infinity,
    ...overrides,
  };
}

const BASE_CTX: GenerationContext = {
  startDate: '2024-01-01',
  endDate: '2024-03-31',
  paymentMode: 'instant',
  federalState: 'DE-BY',
};

const engine = new ScatterEngine();

// ── Disabled rule ─────────────────────────────────────────────────────────────

describe('disabled rule', () => {
  it('returns empty array when enabled=false', () => {
    const rule = makeRule({ enabled: false });
    expect(engine.generate(rule, BASE_CTX)).toHaveLength(0);
  });
});

// ── CountConfig: fixed ────────────────────────────────────────────────────────

describe('CountConfig fixed', () => {
  it('generates exactly count transactions per month', () => {
    const rule = makeRule({ count: { mode: 'fixed', count: 3 } });
    const txns = engine.generate(rule, BASE_CTX);
    // Jan + Feb + Mar = 3 months × 3 = 9
    expect(txns).toHaveLength(9);
  });

  it('zero count generates nothing', () => {
    const rule = makeRule({ count: { mode: 'fixed', count: 0 } });
    expect(engine.generate(rule, BASE_CTX)).toHaveLength(0);
  });
});

// ── CountConfig: range ────────────────────────────────────────────────────────

describe('CountConfig range', () => {
  it('generates count within [min, max] per month', () => {
    const rule = makeRule({ seed: 77, count: { mode: 'range', min: 2, max: 5 } });
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2024-01-01', endDate: '2024-12-31' };
    const txns = engine.generate(rule, ctx);
    // 12 months × [2,5] = 24–60 transactions
    expect(txns.length).toBeGreaterThanOrEqual(24);
    expect(txns.length).toBeLessThanOrEqual(60);
  });

  it('min=max acts as fixed count', () => {
    const rule = makeRule({ seed: 10, count: { mode: 'range', min: 4, max: 4 } });
    const txns = engine.generate(rule, BASE_CTX);
    // 3 months × 4 = 12
    expect(txns).toHaveLength(12);
  });
});

// ── Budget compliance (SZ-02) ─────────────────────────────────────────────────

describe('budget compliance (SZ-02)', () => {
  it('does not exceed budgetPerCycle', () => {
    const rule = makeRule({
      seed: 1,
      amount: { mode: 'fix', amount: 30 },
      count: { mode: 'fixed', count: 10 },
      transactionType: 'expense',
      budgetPerCycle: 100,
    });
    const txns = engine.generate(rule, BASE_CTX);
    // Group by month and verify budget per month ≤ 100
    const byMonth: Record<string, number> = {};
    for (const tx of txns) {
      const m = tx.date.slice(0, 7);
      byMonth[m] = (byMonth[m] ?? 0) + Math.abs(tx.amount);
    }
    for (const [, total] of Object.entries(byMonth)) {
      expect(total).toBeLessThanOrEqual(100 + 0.01); // small float tolerance
    }
  });

  it('Infinity budget allows all transactions', () => {
    const rule = makeRule({
      amount: { mode: 'fix', amount: 9999 },
      count: { mode: 'fixed', count: 3 },
      budgetPerCycle: Infinity,
    });
    // 3 months × 3 = 9 transactions with no budget cap
    expect(engine.generate(rule, BASE_CTX)).toHaveLength(9);
  });

  it('budget cap stops generation early within month', () => {
    const rule = makeRule({
      seed: 5,
      amount: { mode: 'fix', amount: 50 },
      count: { mode: 'fixed', count: 10 },
      transactionType: 'expense',
      budgetPerCycle: 70, // only 1 transaction fits (50 < 70, 50+50=100 > 70)
    });
    const txns = engine.generate(rule, BASE_CTX);
    // 3 months × 1 = 3 (budget allows only 1 per month at €50 each with cap €70)
    expect(txns).toHaveLength(3);
  });
});

// ── Determinism with seed (E-03) ─────────────────────────────────────────────

describe('determinism with seed (E-03)', () => {
  it('same seed produces identical output', () => {
    const rule = makeRule({ seed: 99 });
    const run1 = engine.generate(rule, BASE_CTX);
    const run2 = engine.generate(rule, BASE_CTX);
    expect(run1).toEqual(run2);
  });

  it('different seeds produce different output', () => {
    const r1 = makeRule({ seed: 1 });
    const r2 = makeRule({ seed: 2 });
    const txns1 = engine.generate(r1, BASE_CTX);
    const txns2 = engine.generate(r2, BASE_CTX);
    // Same count (fixed), different dates
    expect(txns1.map((t) => t.date)).not.toEqual(txns2.map((t) => t.date));
  });

  it('uses globalSeed from context when rule has no seed', () => {
    const rule = makeRule({ seed: undefined });
    const ctx: GenerationContext = { ...BASE_CTX, globalSeed: 55 };
    expect(engine.generate(rule, ctx)).toEqual(engine.generate(rule, ctx));
  });
});

// ── Date boundaries ───────────────────────────────────────────────────────────

describe('date boundaries', () => {
  it('all transaction dates are within [startDate, endDate]', () => {
    const rule = makeRule({ seed: 3, count: { mode: 'fixed', count: 10 } });
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2024-03-15', endDate: '2024-03-20' };
    const txns = engine.generate(rule, ctx);
    for (const tx of txns) {
      expect(tx.date >= '2024-03-15').toBe(true);
      expect(tx.date <= '2024-03-20').toBe(true);
    }
  });

  it('transactions are sorted by date then time', () => {
    const rule = makeRule({ seed: 44, count: { mode: 'fixed', count: 5 } });
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2020-01-01', endDate: '2024-12-31' };
    const txns = engine.generate(rule, ctx);
    for (let i = 1; i < txns.length; i++) {
      const a = txns[i - 1]!.date + txns[i - 1]!.time;
      const b = txns[i]!.date + txns[i]!.time;
      expect(a <= b).toBe(true);
    }
  });

  it('zero-length range produces no transactions', () => {
    const rule = makeRule();
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2024-06-01', endDate: '2024-01-01' };
    expect(engine.generate(rule, ctx)).toHaveLength(0);
  });
});

// ── Sign convention ───────────────────────────────────────────────────────────

describe('sign convention', () => {
  it('expense amounts are negative', () => {
    const rule = makeRule({ transactionType: 'expense', amount: { mode: 'fix', amount: 25 } });
    const txns = engine.generate(rule, BASE_CTX);
    for (const tx of txns) expect(tx.amount).toBe(-25);
  });

  it('income amounts are positive', () => {
    const rule = makeRule({ transactionType: 'income', amount: { mode: 'fix', amount: 10 } });
    const txns = engine.generate(rule, BASE_CTX);
    for (const tx of txns) expect(tx.amount).toBe(10);
  });

  it('transfer preserves AmountConfig sign', () => {
    const rule = makeRule({
      transactionType: 'transfer',
      amount: { mode: 'fix', amount: -150 },
    });
    const txns = engine.generate(rule, BASE_CTX);
    for (const tx of txns) expect(tx.amount).toBe(-150);
  });
});

// ── Category / counterparty ───────────────────────────────────────────────────

describe('category and counterparty selection', () => {
  it('picks from all provided categories', () => {
    const rule = makeRule({
      seed: 88,
      categories: [CAT_A, CAT_B],
      count: { mode: 'fixed', count: 20 },
    });
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2020-01-01', endDate: '2024-12-31' };
    const txns = engine.generate(rule, ctx);
    const cats = new Set(txns.map((t) => t.category));
    expect(cats.has(CAT_A)).toBe(true);
    expect(cats.has(CAT_B)).toBe(true);
  });

  it('picks from all provided counterparties', () => {
    const rule = makeRule({
      seed: 22,
      counterparties: ['Aldi', 'Rewe', 'Penny'],
      count: { mode: 'fixed', count: 15 },
    });
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2020-01-01', endDate: '2024-12-31' };
    const txns = engine.generate(rule, ctx);
    const cps = new Set(txns.map((t) => t.counterparty));
    expect(cps.size).toBeGreaterThan(1);
  });
});

// ── Purpose template ──────────────────────────────────────────────────────────

describe('purpose template {n}', () => {
  it('increments {n} across all transactions globally', () => {
    const rule = makeRule({
      purpose: 'Tx {n}',
      count: { mode: 'fixed', count: 2 },
    });
    const txns = engine.generate(rule, BASE_CTX);
    // 3 months × 2 = 6 transactions numbered 1–6
    const purposes = txns.map((t) => t.purpose);
    expect(purposes).toContain('Tx 1');
    expect(purposes).toContain('Tx 2');
    expect(purposes).toContain('Tx 6');
  });
});

// ── Time format ───────────────────────────────────────────────────────────────

describe('time format', () => {
  it('time is HH:MM format', () => {
    const rule = makeRule({ count: { mode: 'fixed', count: 3 } });
    const txns = engine.generate(rule, BASE_CTX);
    for (const tx of txns) {
      expect(tx.time).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});

// ── Source and ruleId ────────────────────────────────────────────────────────

describe('metadata', () => {
  it('source is "scatter"', () => {
    const txns = engine.generate(makeRule(), BASE_CTX);
    for (const tx of txns) expect(tx.source).toBe('scatter');
  });

  it('ruleId matches rule.id', () => {
    const rule = makeRule({ id: 'scatter-test-id' });
    const txns = engine.generate(rule, BASE_CTX);
    for (const tx of txns) expect(tx.ruleId).toBe('scatter-test-id');
  });

  it('each transaction has a unique UUID', () => {
    const rule = makeRule({ count: { mode: 'fixed', count: 10 } });
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2020-01-01', endDate: '2024-12-31' };
    const txns = engine.generate(rule, ctx);
    const ids = new Set(txns.map((t) => t.id));
    expect(ids.size).toBe(txns.length);
  });
});
