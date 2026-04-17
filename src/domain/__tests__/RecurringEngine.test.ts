/**
 * src/domain/__tests__/RecurringEngine.test.ts
 *
 * Unit tests for RecurringEngine (CLA-33 / P2-04).
 *
 * Coverage areas:
 *   - All 4 Buchungstag-Typen: fix, working, ultimo, sepa
 *   - All cycle periods: monthly, quarterly, semiannual, annual
 *   - Transaction type sign logic: income, expense, transfer
 *   - 20-year generation correctness (TC-03)
 *   - Deterministic output with seed
 *   - Disabled rule → empty output
 *   - Day clamping (e.g. dayOfMonth=31 in Feb)
 *   - Ultimo in SEPA mode: booking date does not overflow into next month
 *   - Date range boundary conditions
 */

import { describe, expect, it } from 'vitest';
import { RecurringEngine } from '../RecurringEngine';
import type { RecurringRule, GenerationContext } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const engine = new RecurringEngine();

/** Minimal valid context spanning one calendar year. */
const CTX_2023: GenerationContext = {
  startDate: '2023-01-01',
  endDate: '2023-12-31',
  paymentMode: 'instant', // no working-day adjustment by default
  federalState: 'DE-BY',
  globalSeed: 42,
};

/** Minimal valid context spanning 20 years. */
const CTX_20Y: GenerationContext = {
  startDate: '2005-01-01',
  endDate: '2024-12-31',
  paymentMode: 'instant',
  federalState: 'DE-NW',
  globalSeed: 1,
};

/** Build a RecurringRule with sensible defaults that callers can override. */
function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'test-rule-id',
    name: 'Test Rule',
    type: 'recurring',
    enabled: true,
    createdAt: '2023-01-01T00:00:00.000Z',
    counterparty: 'Testempfänger',
    purpose: 'Test Überweisung',
    category: 'Miete',
    transactionType: 'expense',
    amount: { mode: 'fix', amount: 1000 },
    cycle: 'monthly',
    dayOfMonth: 1,
    bookingDayType: 'fix',
    ...overrides,
  };
}

// ── Disabled rule ──────────────────────────────────────────────────────────────

describe('Disabled rule', () => {
  it('returns empty array when rule is disabled', () => {
    const txns = engine.generate(rule({ enabled: false }), CTX_2023);
    expect(txns).toHaveLength(0);
  });
});

// ── Monthly cycle ─────────────────────────────────────────────────────────────

describe('Monthly cycle', () => {
  it('generates 12 transactions for a full calendar year', () => {
    const txns = engine.generate(rule({ cycle: 'monthly', dayOfMonth: 15 }), CTX_2023);
    expect(txns).toHaveLength(12);
  });

  it('generates dates on the 15th of each month', () => {
    const txns = engine.generate(rule({ cycle: 'monthly', dayOfMonth: 15 }), CTX_2023);
    for (const tx of txns) {
      expect(tx.date.slice(8)).toBe('15'); // day part
    }
  });

  it('generates exactly 1 transaction per month for a single-month range', () => {
    const ctx: GenerationContext = { ...CTX_2023, startDate: '2023-03-01', endDate: '2023-03-31' };
    const txns = engine.generate(rule({ cycle: 'monthly', dayOfMonth: 10 }), ctx);
    expect(txns).toHaveLength(1);
    expect(txns[0]!.date).toBe('2023-03-10');
  });

  it('transactions are sorted ascending by date', () => {
    const txns = engine.generate(rule({ cycle: 'monthly', dayOfMonth: 1 }), CTX_2023);
    for (let i = 1; i < txns.length; i++) {
      expect(txns[i]!.date >= txns[i - 1]!.date).toBe(true);
    }
  });
});

// ── Quarterly cycle ───────────────────────────────────────────────────────────

describe('Quarterly cycle', () => {
  it('generates 4 transactions per year', () => {
    const txns = engine.generate(rule({ cycle: 'quarterly', dayOfMonth: 1 }), CTX_2023);
    expect(txns).toHaveLength(4);
  });

  it('quarterly dates are 3 months apart', () => {
    const txns = engine.generate(rule({ cycle: 'quarterly', dayOfMonth: 5 }), CTX_2023);
    expect(txns).toHaveLength(4);
    // Months should be 1, 4, 7, 10 (the 5th of Jan, Apr, Jul, Oct)
    const months = txns.map((tx) => parseInt(tx.date.slice(5, 7), 10));
    expect(months).toEqual([1, 4, 7, 10]);
  });
});

// ── Semiannual cycle ──────────────────────────────────────────────────────────

describe('Semiannual cycle', () => {
  it('generates 2 transactions per year', () => {
    const txns = engine.generate(rule({ cycle: 'semiannual', dayOfMonth: 1 }), CTX_2023);
    expect(txns).toHaveLength(2);
  });
});

// ── Annual cycle ──────────────────────────────────────────────────────────────

describe('Annual cycle', () => {
  it('generates 1 transaction per year', () => {
    const txns = engine.generate(rule({ cycle: 'annual', dayOfMonth: 15 }), CTX_2023);
    expect(txns).toHaveLength(1);
  });

  it('generates 20 transactions over 20 years', () => {
    const txns = engine.generate(rule({ cycle: 'annual', dayOfMonth: 1 }), CTX_20Y);
    expect(txns).toHaveLength(20);
  });
});

// ── 20-year generation (TC-03) ────────────────────────────────────────────────

describe('20-year generation (TC-03)', () => {
  it('generates 240 monthly transactions over 20 years', () => {
    const txns = engine.generate(rule({ cycle: 'monthly', dayOfMonth: 1 }), CTX_20Y);
    expect(txns).toHaveLength(240);
  });

  it('all transactions fall within the date range', () => {
    const txns = engine.generate(rule({ cycle: 'monthly', dayOfMonth: 28 }), CTX_20Y);
    for (const tx of txns) {
      expect(tx.date >= CTX_20Y.startDate).toBe(true);
      expect(tx.date <= CTX_20Y.endDate).toBe(true);
    }
  });

  it('generates correct number of quarterly transactions over 20 years', () => {
    const txns = engine.generate(rule({ cycle: 'quarterly', dayOfMonth: 1 }), CTX_20Y);
    expect(txns).toHaveLength(80); // 20 years × 4 quarters
  });
});

// ── Booking day type: fix ─────────────────────────────────────────────────────

describe('BookingDayType: fix', () => {
  it('uses exact calendar dates without adjustment', () => {
    // 2023-01-01 is a Sunday – in SEPA mode with fix, it stays as Sunday
    const ctx: GenerationContext = { ...CTX_2023, paymentMode: 'sepa' };
    const txns = engine.generate(rule({ bookingDayType: 'fix', dayOfMonth: 1 }), ctx);
    expect(txns[0]!.date).toBe('2023-01-01'); // stays on Sunday
  });
});

// ── Booking day type: working ─────────────────────────────────────────────────

describe('BookingDayType: working', () => {
  it('advances past weekends in SEPA mode', () => {
    // 2023-01-01 is a Sunday → next working day is 2023-01-02 (Monday)
    const ctx: GenerationContext = { ...CTX_2023, paymentMode: 'sepa' };
    const txns = engine.generate(rule({ bookingDayType: 'working', dayOfMonth: 1 }), ctx);
    // First tx should be advanced off Sunday 2023-01-01
    expect(txns[0]!.date).toBe('2023-01-02');
  });

  it('no adjustment in instant mode (all days valid)', () => {
    const ctx: GenerationContext = { ...CTX_2023, paymentMode: 'instant' };
    const txns = engine.generate(rule({ bookingDayType: 'working', dayOfMonth: 1 }), ctx);
    expect(txns[0]!.date).toBe('2023-01-01');
  });
});

// ── Booking day type: sepa ────────────────────────────────────────────────────

describe('BookingDayType: sepa', () => {
  it('advances past weekends in SEPA mode (same as working)', () => {
    const ctx: GenerationContext = { ...CTX_2023, paymentMode: 'sepa' };
    const txns = engine.generate(rule({ bookingDayType: 'sepa', dayOfMonth: 1 }), ctx);
    expect(txns[0]!.date).toBe('2023-01-02');
  });
});

// ── Booking day type: ultimo ──────────────────────────────────────────────────

describe('BookingDayType: ultimo', () => {
  it('uses last day of each month in instant mode', () => {
    const txns = engine.generate(
      rule({ bookingDayType: 'ultimo', dayOfMonth: 1, cycle: 'monthly' }),
      CTX_2023,
    );
    // Check January (31), February (28 – 2023 is not a leap year), ...
    expect(txns[0]!.date).toBe('2023-01-31');
    expect(txns[1]!.date).toBe('2023-02-28');
    expect(txns[2]!.date).toBe('2023-03-31');
    expect(txns[3]!.date).toBe('2023-04-30');
  });

  it('steps backward in SEPA mode to avoid spilling into next month', () => {
    const ctx: GenerationContext = { ...CTX_2023, paymentMode: 'sepa' };
    const txns = engine.generate(
      rule({ bookingDayType: 'ultimo', dayOfMonth: 1, cycle: 'monthly' }),
      ctx,
    );
    // All booking dates must be within their respective calendar months
    for (const tx of txns) {
      const month = tx.date.slice(0, 7); // YYYY-MM
      // The day should not be in the next month
      expect(tx.date.startsWith(month)).toBe(true);
    }
    // 2023-04-30 is a Sunday → prev working day is 2023-04-28 (Friday)
    expect(txns[3]!.date).toBe('2023-04-28');
  });
});

// ── Day clamping ──────────────────────────────────────────────────────────────

describe('Day clamping', () => {
  it('clamps day 31 to last valid day of February', () => {
    const txns = engine.generate(
      rule({ cycle: 'monthly', dayOfMonth: 31, bookingDayType: 'fix' }),
      CTX_2023,
    );
    const feb = txns.find((tx) => tx.date.startsWith('2023-02'));
    expect(feb).toBeDefined();
    expect(feb!.date).toBe('2023-02-28'); // 2023 is not a leap year
  });

  it('clamps day 31 to 30 in months with 30 days', () => {
    const txns = engine.generate(
      rule({ cycle: 'monthly', dayOfMonth: 31, bookingDayType: 'fix' }),
      CTX_2023,
    );
    const apr = txns.find((tx) => tx.date.startsWith('2023-04'));
    expect(apr!.date).toBe('2023-04-30');
  });
});

// ── Transaction type sign logic ───────────────────────────────────────────────

describe('Transaction type sign logic', () => {
  it('income transactions have positive amount', () => {
    const txns = engine.generate(
      rule({ transactionType: 'income', amount: { mode: 'fix', amount: 500 } }),
      CTX_2023,
    );
    for (const tx of txns) {
      expect(tx.amount).toBeGreaterThan(0);
    }
  });

  it('expense transactions have negative amount', () => {
    const txns = engine.generate(
      rule({ transactionType: 'expense', amount: { mode: 'fix', amount: 500 } }),
      CTX_2023,
    );
    for (const tx of txns) {
      expect(tx.amount).toBeLessThan(0);
    }
  });

  it('transfer transactions preserve amount sign (positive)', () => {
    const txns = engine.generate(
      rule({ transactionType: 'transfer', amount: { mode: 'fix', amount: 200 } }),
      CTX_2023,
    );
    expect(txns[0]!.amount).toBe(200);
  });

  it('transfer transactions preserve amount sign (negative)', () => {
    const txns = engine.generate(
      rule({ transactionType: 'transfer', amount: { mode: 'fix', amount: -200 } }),
      CTX_2023,
    );
    expect(txns[0]!.amount).toBe(-200);
  });
});

// ── Determinism with seed ─────────────────────────────────────────────────────

describe('Determinism with seed', () => {
  it('produces identical output for the same seed (range amount)', () => {
    const r = rule({
      amount: { mode: 'range', min: 800, max: 1200 },
      seed: 99,
    });
    const txns1 = engine.generate(r, CTX_2023);
    const txns2 = engine.generate(r, CTX_2023);
    expect(txns1.map((tx) => tx.amount)).toEqual(txns2.map((tx) => tx.amount));
  });

  it('produces different output for different seeds', () => {
    const r1 = rule({ amount: { mode: 'range', min: 800, max: 1200 }, seed: 1 });
    const r2 = rule({ amount: { mode: 'range', min: 800, max: 1200 }, seed: 2 });
    const amounts1 = engine.generate(r1, CTX_2023).map((tx) => tx.amount);
    const amounts2 = engine.generate(r2, CTX_2023).map((tx) => tx.amount);
    expect(amounts1).not.toEqual(amounts2);
  });

  it('rule seed overrides global context seed', () => {
    const r = rule({ amount: { mode: 'range', min: 100, max: 900 }, seed: 77 });
    const ctxA = { ...CTX_2023, globalSeed: 1 };
    const ctxB = { ...CTX_2023, globalSeed: 2 };
    const a = engine.generate(r, ctxA).map((tx) => tx.amount);
    const b = engine.generate(r, ctxB).map((tx) => tx.amount);
    // Same rule seed → same amounts regardless of context seed
    expect(a).toEqual(b);
  });
});

// ── Transaction shape ─────────────────────────────────────────────────────────

describe('Transaction shape', () => {
  it('each transaction has required fields', () => {
    const txns = engine.generate(rule(), CTX_2023);
    for (const tx of txns) {
      expect(tx).toHaveProperty('id');
      expect(tx).toHaveProperty('date');
      expect(tx).toHaveProperty('time');
      expect(tx).toHaveProperty('amount');
      expect(tx).toHaveProperty('purpose');
      expect(tx).toHaveProperty('counterparty');
      expect(tx).toHaveProperty('category');
      expect(tx).toHaveProperty('source', 'recurring');
      expect(tx).toHaveProperty('ruleId', 'test-rule-id');
    }
  });

  it('each transaction has a unique id', () => {
    const txns = engine.generate(rule({ cycle: 'monthly' }), CTX_2023);
    const ids = txns.map((tx) => tx.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('time field is HH:MM format', () => {
    const txns = engine.generate(rule(), CTX_2023);
    for (const tx of txns) {
      expect(tx.time).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});

// ── Range boundary conditions ─────────────────────────────────────────────────

describe('Date range boundary conditions', () => {
  it('includes transaction exactly on startDate', () => {
    const ctx: GenerationContext = {
      ...CTX_2023,
      startDate: '2023-06-15',
      endDate: '2023-06-30',
    };
    const txns = engine.generate(rule({ dayOfMonth: 15, cycle: 'monthly' }), ctx);
    expect(txns).toHaveLength(1);
    expect(txns[0]!.date).toBe('2023-06-15');
  });

  it('includes transaction exactly on endDate', () => {
    const ctx: GenerationContext = {
      ...CTX_2023,
      startDate: '2023-06-01',
      endDate: '2023-06-15',
    };
    const txns = engine.generate(rule({ dayOfMonth: 15, cycle: 'monthly' }), ctx);
    expect(txns).toHaveLength(1);
    expect(txns[0]!.date).toBe('2023-06-15');
  });

  it('returns empty when range is before any occurrence', () => {
    const ctx: GenerationContext = {
      ...CTX_2023,
      startDate: '2023-01-01',
      endDate: '2023-01-14',
    };
    const txns = engine.generate(rule({ dayOfMonth: 15, cycle: 'monthly' }), ctx);
    expect(txns).toHaveLength(0);
  });
});

// ── Trend integration ─────────────────────────────────────────────────────────

describe('Trend integration', () => {
  it('linear trend increases amounts over time', () => {
    const r = rule({
      amount: { mode: 'fix', amount: 1000 },
      trend: { type: 'linear', rate: 120, startDate: '2023-01-01' },
      cycle: 'monthly',
    });
    const txns = engine.generate(r, CTX_2023);
    // First transaction is at startDate → trend = 0 → amount = expense → -1000
    // Later transactions have higher absolute amounts
    expect(Math.abs(txns[txns.length - 1]!.amount)).toBeGreaterThan(Math.abs(txns[0]!.amount));
  });
});
