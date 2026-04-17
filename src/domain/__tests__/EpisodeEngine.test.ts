/**
 * src/domain/__tests__/EpisodeEngine.test.ts
 *
 * Unit tests for EpisodeEngine (P3-05 / CLA-39).
 *
 * Coverage targets (CLA-39):
 *   - Deterministic output with seed (E-03)
 *   - Regular mode: guaranteed inclusion in every cycle (EP-03)
 *   - Irregular mode: probability-based inclusion (EP-04)
 *   - Budget / amount compliance
 *   - Probability distribution statistically correct
 *   - Disabled rule emits no transactions
 *   - Date boundaries respected
 *   - Category and counterparty selection
 *   - Cycle alignment (monthly, quarterly, semiannual, annual)
 *   - BookingDayType resolution (fix, working, sepa, ultimo)
 *   - Purpose template {n} substitution
 */

import { EpisodeEngine } from '../EpisodeEngine.js';
import type { EpisodeRule, GenerationContext } from '../types.js';
import type { Category } from '../category/categoryEnum.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CAT_A = 'lebensmittel' as Category;
const CAT_B = 'restaurant' as Category;

function makeRule(overrides: Partial<EpisodeRule> = {}): EpisodeRule {
  return {
    id: 'rule-ep-1',
    name: 'Test Episode',
    type: 'episode',
    enabled: true,
    createdAt: '2020-01-01T00:00:00.000Z',
    seed: 42,
    counterparties: ['Arzt', 'Klinik'],
    purpose: 'Episode {n}',
    categories: [CAT_A],
    transactionType: 'expense',
    amount: { mode: 'fix', amount: 100 },
    frequency: { mode: 'regular' },
    cycle: 'monthly',
    bookingDayType: 'fix',
    ...overrides,
  };
}

const BASE_CTX: GenerationContext = {
  startDate: '2024-01-01',
  endDate: '2024-06-30',
  paymentMode: 'instant',
  federalState: 'DE-BY',
};

const engine = new EpisodeEngine();

// ── Disabled rule ─────────────────────────────────────────────────────────────

describe('disabled rule', () => {
  it('returns empty array when enabled=false', () => {
    const rule = makeRule({ enabled: false });
    expect(engine.generate(rule, BASE_CTX)).toHaveLength(0);
  });
});

// ── Regular mode (EP-03) ──────────────────────────────────────────────────────

describe('regular mode (EP-03)', () => {
  it('generates exactly one transaction per monthly cycle', () => {
    const rule = makeRule({ frequency: { mode: 'regular' }, cycle: 'monthly' });
    const txns = engine.generate(rule, BASE_CTX);
    // Jan–Jun = 6 months → 6 transactions
    expect(txns).toHaveLength(6);
  });

  it('generates one transaction per quarterly cycle', () => {
    const rule = makeRule({ frequency: { mode: 'regular' }, cycle: 'quarterly' });
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2024-01-01', endDate: '2024-12-31' };
    const txns = engine.generate(rule, ctx);
    // Q1, Q2, Q3, Q4 → 4 transactions
    expect(txns).toHaveLength(4);
  });

  it('generates one transaction per semiannual cycle', () => {
    const rule = makeRule({ frequency: { mode: 'regular' }, cycle: 'semiannual' });
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2024-01-01', endDate: '2024-12-31' };
    const txns = engine.generate(rule, ctx);
    // H1 + H2 → 2 transactions
    expect(txns).toHaveLength(2);
  });

  it('generates one transaction per annual cycle over 3 years', () => {
    const rule = makeRule({ frequency: { mode: 'regular' }, cycle: 'annual' });
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2022-01-01', endDate: '2024-12-31' };
    const txns = engine.generate(rule, ctx);
    expect(txns).toHaveLength(3);
  });

  it('all transaction dates are within [startDate, endDate]', () => {
    const rule = makeRule({ frequency: { mode: 'regular' }, cycle: 'monthly' });
    const txns = engine.generate(rule, BASE_CTX);
    for (const tx of txns) {
      expect(tx.date >= BASE_CTX.startDate).toBe(true);
      expect(tx.date <= BASE_CTX.endDate).toBe(true);
    }
  });

  it('transactions are sorted ascending by date', () => {
    const rule = makeRule({ frequency: { mode: 'regular' }, cycle: 'monthly' });
    const txns = engine.generate(rule, BASE_CTX);
    for (let i = 1; i < txns.length; i++) {
      expect(txns[i]!.date >= txns[i - 1]!.date).toBe(true);
    }
  });

  it('source is "episode"', () => {
    const rule = makeRule();
    const txns = engine.generate(rule, BASE_CTX);
    for (const tx of txns) expect(tx.source).toBe('episode');
  });

  it('ruleId matches the rule id', () => {
    const rule = makeRule({ id: 'my-rule-id' });
    const txns = engine.generate(rule, BASE_CTX);
    for (const tx of txns) expect(tx.ruleId).toBe('my-rule-id');
  });
});

// ── Irregular mode (EP-04) ────────────────────────────────────────────────────

describe('irregular mode (EP-04)', () => {
  it('never generates with probability 0', () => {
    const rule = makeRule({ frequency: { mode: 'irregular', probability: 0 } });
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2020-01-01', endDate: '2024-12-31' };
    expect(engine.generate(rule, ctx)).toHaveLength(0);
  });

  it('always generates with probability 1 (same as regular)', () => {
    const regular = makeRule({ seed: 100, frequency: { mode: 'regular' }, cycle: 'monthly' });
    const always = makeRule({ seed: 100, frequency: { mode: 'irregular', probability: 1 } });
    expect(engine.generate(regular, BASE_CTX)).toHaveLength(
      engine.generate(always, BASE_CTX).length,
    );
  });

  it('generates approximately 50% of cycles with probability 0.5', () => {
    const rule = makeRule({
      seed: 99,
      frequency: { mode: 'irregular', probability: 0.5 },
      cycle: 'monthly',
    });
    // 60 months over 5 years → expect ~30 ± 20%
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2020-01-01', endDate: '2024-12-31' };
    const txns = engine.generate(rule, ctx);
    expect(txns.length).toBeGreaterThan(10);
    expect(txns.length).toBeLessThan(50);
  });

  it('all dates remain within [startDate, endDate] in irregular mode', () => {
    const rule = makeRule({
      frequency: { mode: 'irregular', probability: 0.7 },
      cycle: 'monthly',
    });
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2020-01-01', endDate: '2024-12-31' };
    const txns = engine.generate(rule, ctx);
    for (const tx of txns) {
      expect(tx.date >= '2020-01-01').toBe(true);
      expect(tx.date <= '2024-12-31').toBe(true);
    }
  });
});

// ── Determinism with seed (E-03) ─────────────────────────────────────────────

describe('determinism with seed (E-03)', () => {
  it('same seed produces identical output', () => {
    const rule = makeRule({ seed: 12345 });
    const run1 = engine.generate(rule, BASE_CTX);
    const run2 = engine.generate(rule, BASE_CTX);
    expect(run1).toEqual(run2);
  });

  it('different seeds produce different output', () => {
    const rule1 = makeRule({ seed: 1 });
    const rule2 = makeRule({ seed: 2 });
    const txns1 = engine.generate(rule1, BASE_CTX);
    const txns2 = engine.generate(rule2, BASE_CTX);
    // Same count (regular mode) but different dates/times/amounts
    const dates1 = txns1.map((t) => t.date);
    const dates2 = txns2.map((t) => t.date);
    expect(dates1).not.toEqual(dates2);
  });

  it('global seed (via context) is used when rule has no seed', () => {
    const rule = makeRule({ seed: undefined });
    const ctx1: GenerationContext = { ...BASE_CTX, globalSeed: 42 };
    const ctx2: GenerationContext = { ...BASE_CTX, globalSeed: 42 };
    expect(engine.generate(rule, ctx1)).toEqual(engine.generate(rule, ctx2));
  });
});

// ── Amount and sign ───────────────────────────────────────────────────────────

describe('amount and sign', () => {
  it('expense transactions have negative amounts', () => {
    const rule = makeRule({ transactionType: 'expense', amount: { mode: 'fix', amount: 50 } });
    const txns = engine.generate(rule, BASE_CTX);
    for (const tx of txns) expect(tx.amount).toBe(-50);
  });

  it('income transactions have positive amounts', () => {
    const rule = makeRule({ transactionType: 'income', amount: { mode: 'fix', amount: 200 } });
    const txns = engine.generate(rule, BASE_CTX);
    for (const tx of txns) expect(tx.amount).toBe(200);
  });

  it('transfer transactions preserve AmountConfig sign', () => {
    const rule = makeRule({
      transactionType: 'transfer',
      amount: { mode: 'fix', amount: -300 },
    });
    const txns = engine.generate(rule, BASE_CTX);
    for (const tx of txns) expect(tx.amount).toBe(-300);
  });

  it('range amounts stay within [min, max]', () => {
    const rule = makeRule({
      seed: 7,
      amount: { mode: 'range', min: 10, max: 50 },
      transactionType: 'income',
    });
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2020-01-01', endDate: '2024-12-31' };
    const txns = engine.generate(rule, ctx);
    for (const tx of txns) {
      expect(tx.amount).toBeGreaterThanOrEqual(10);
      expect(tx.amount).toBeLessThanOrEqual(50);
    }
  });
});

// ── Multi-category selection ──────────────────────────────────────────────────

describe('multi-category selection', () => {
  it('picks from the categories list', () => {
    const rule = makeRule({
      seed: 55,
      categories: [CAT_A, CAT_B],
      cycle: 'monthly',
    });
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2020-01-01', endDate: '2024-12-31' };
    const txns = engine.generate(rule, ctx);
    const used = new Set(txns.map((t) => t.category));
    // With 60 monthly transactions and 2 categories, both should appear.
    expect(used.has(CAT_A)).toBe(true);
    expect(used.has(CAT_B)).toBe(true);
  });
});

// ── Counterparty selection ────────────────────────────────────────────────────

describe('counterparty selection', () => {
  it('picks from the counterparties list', () => {
    const rule = makeRule({
      seed: 77,
      counterparties: ['Arzt A', 'Arzt B', 'Klinik'],
      cycle: 'monthly',
    });
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2020-01-01', endDate: '2024-12-31' };
    const txns = engine.generate(rule, ctx);
    const used = new Set(txns.map((t) => t.counterparty));
    expect(used.size).toBeGreaterThan(1);
  });

  it('handles single counterparty', () => {
    const rule = makeRule({ counterparties: ['Only One'] });
    const txns = engine.generate(rule, BASE_CTX);
    for (const tx of txns) expect(tx.counterparty).toBe('Only One');
  });
});

// ── Purpose template ──────────────────────────────────────────────────────────

describe('purpose template {n}', () => {
  it('replaces {n} with 1-indexed occurrence number', () => {
    const rule = makeRule({ purpose: 'Visit #{n}', cycle: 'monthly' });
    const txns = engine.generate(rule, BASE_CTX);
    expect(txns[0]!.purpose).toBe('Visit #1');
    expect(txns[1]!.purpose).toBe('Visit #2');
    expect(txns[5]!.purpose).toBe('Visit #6');
  });

  it('leaves purpose unchanged when no template marker present', () => {
    const rule = makeRule({ purpose: 'Annual dentist' });
    const txns = engine.generate(rule, BASE_CTX);
    for (const tx of txns) expect(tx.purpose).toBe('Annual dentist');
  });
});

// ── BookingDayType resolution ─────────────────────────────────────────────────

describe('bookingDayType resolution (SEPA mode)', () => {
  it('fix: does not adjust dates', () => {
    const rule = makeRule({ bookingDayType: 'fix' });
    const txns = engine.generate(rule, { ...BASE_CTX, paymentMode: 'sepa' });
    // All dates must be within range; no further restriction.
    for (const tx of txns) {
      expect(tx.date >= BASE_CTX.startDate).toBe(true);
      expect(tx.date <= BASE_CTX.endDate).toBe(true);
    }
  });

  it('working: advances dates to working days in SEPA mode', () => {
    const rule = makeRule({ seed: 42, bookingDayType: 'working' });
    const txns = engine.generate(rule, { ...BASE_CTX, paymentMode: 'sepa' });
    for (const tx of txns) {
      const d = new Date(tx.date + 'T00:00:00Z');
      // Weekends are day 0 (Sun) or day 6 (Sat)
      const dow = d.getUTCDay();
      expect(dow).not.toBe(0); // Sunday
      expect(dow).not.toBe(6); // Saturday
    }
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('single-day range', () => {
    const rule = makeRule({ frequency: { mode: 'regular' }, cycle: 'monthly' });
    const ctx: GenerationContext = {
      ...BASE_CTX,
      startDate: '2024-03-15',
      endDate: '2024-03-15',
    };
    const txns = engine.generate(rule, ctx);
    // Cycle is March, range is just one day – may or may not include (depends on date resolution)
    expect(txns.length).toBeLessThanOrEqual(1);
    for (const tx of txns) {
      expect(tx.date).toBe('2024-03-15');
    }
  });

  it('zero-length date range produces no transactions', () => {
    // endDate before startDate
    const rule = makeRule();
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2024-06-01', endDate: '2024-01-01' };
    expect(engine.generate(rule, ctx)).toHaveLength(0);
  });

  it('each transaction has a unique UUID', () => {
    const rule = makeRule({ cycle: 'monthly' });
    const ctx: GenerationContext = { ...BASE_CTX, startDate: '2020-01-01', endDate: '2024-12-31' };
    const txns = engine.generate(rule, ctx);
    const ids = txns.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('time is HH:MM format', () => {
    const rule = makeRule({ cycle: 'monthly' });
    const txns = engine.generate(rule, BASE_CTX);
    for (const tx of txns) {
      expect(tx.time).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});
