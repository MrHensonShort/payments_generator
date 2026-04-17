/**
 * src/domain/__tests__/AmountCalculator.test.ts
 *
 * Unit tests for AmountCalculator (CLA-31 / P2-02).
 *
 * Coverage areas:
 *   - Fix mode:   constant output regardless of rng
 *   - Range mode: output in [min, max]; deterministic with seed; mean ≈ midpoint
 *   - Basis mode: output within ±variance %; deterministic with seed; mean ≈ base
 *   - Boundary values: zero variance, zero rate, same min/max
 *   - Trend – linear:       correct arithmetic progression
 *   - Trend – exponential:  correct compound growth
 *   - Trend: negative rates; date before startDate; zero delta
 *   - Rounding: result always has ≤ 2 decimal places
 *   - Determinism: identical seed → identical sequence across modes
 *   - AmountCalculator.yearDelta: correct fractional-year calculation
 */

import { describe, expect, it } from 'vitest';
import { AmountCalculator } from '../AmountCalculator';
import { createRng } from '../rng/seededRng';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEED = 42;
const calc = new AmountCalculator();

/** Always returns 0 – useful for deterministic basis/range edge-cases. */
const zeroRng = () => 0;
/** Always returns the value just below 1 – upper-bound edge. */
const oneRng = () => 1 - Number.EPSILON;
/** Returns exactly 0.5 – midpoint. */
const halfRng = () => 0.5;

// ── Fix mode ─────────────────────────────────────────────────────────────────

describe('Fix mode', () => {
  it('returns the configured fixed amount', () => {
    const rng = createRng(SEED);
    expect(calc.calculate({ mode: 'fix', amount: 1000 }, rng)).toBe(1000);
  });

  it('does not consume the RNG (result is same regardless of rng state)', () => {
    const rng = createRng(SEED);
    const first = calc.calculate({ mode: 'fix', amount: 500 }, rng);
    const second = calc.calculate({ mode: 'fix', amount: 500 }, rng);
    expect(first).toBe(500);
    expect(second).toBe(500);
  });

  it('handles negative amounts (debits)', () => {
    expect(calc.calculate({ mode: 'fix', amount: -250 }, zeroRng)).toBe(-250);
  });

  it('handles zero amount', () => {
    expect(calc.calculate({ mode: 'fix', amount: 0 }, zeroRng)).toBe(0);
  });

  it('handles fractional cent amounts (rounds to 2 dp)', () => {
    // 333.333... → 333.33
    expect(calc.calculate({ mode: 'fix', amount: 333.333 }, zeroRng)).toBe(333.33);
  });
});

// ── Range mode ────────────────────────────────────────────────────────────────

describe('Range mode', () => {
  it('returns a value within [min, max]', () => {
    const rng = createRng(SEED);
    for (let i = 0; i < 100; i++) {
      const v = calc.calculate({ mode: 'range', min: 100, max: 500 }, rng);
      expect(v).toBeGreaterThanOrEqual(100);
      expect(v).toBeLessThanOrEqual(500);
    }
  });

  it('returns min when rng → 0', () => {
    const v = calc.calculate({ mode: 'range', min: 200, max: 800 }, zeroRng);
    expect(v).toBe(200);
  });

  it('returns max when rng → 1', () => {
    const v = calc.calculate({ mode: 'range', min: 200, max: 800 }, oneRng);
    expect(v).toBe(800);
  });

  it('returns midpoint when rng = 0.5', () => {
    const v = calc.calculate({ mode: 'range', min: 100, max: 300 }, halfRng);
    expect(v).toBe(200);
  });

  it('works with min === max (degenerate range)', () => {
    const rng = createRng(SEED);
    expect(calc.calculate({ mode: 'range', min: 75, max: 75 }, rng)).toBe(75);
  });

  it('works with negative bounds (credit transfers)', () => {
    const v = calc.calculate({ mode: 'range', min: -500, max: -100 }, halfRng);
    expect(v).toBe(-300);
  });

  it('mean converges near midpoint over many calls', () => {
    const rng = createRng(SEED);
    const MIN = 100;
    const MAX = 900;
    const samples = Array.from({ length: 1000 }, () =>
      calc.calculate({ mode: 'range', min: MIN, max: MAX }, rng),
    );
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(450);
    expect(mean).toBeLessThan(550);
  });

  it('is deterministic: same seed → same sequence', () => {
    const rng1 = createRng(SEED);
    const rng2 = createRng(SEED);
    for (let i = 0; i < 20; i++) {
      const a = calc.calculate({ mode: 'range', min: 10, max: 100 }, rng1);
      const b = calc.calculate({ mode: 'range', min: 10, max: 100 }, rng2);
      expect(a).toBe(b);
    }
  });
});

// ── Basis±% mode ──────────────────────────────────────────────────────────────

describe('Basis±% mode', () => {
  it('stays within [base*(1-v), base*(1+v)] for positive base', () => {
    const rng = createRng(SEED);
    const BASE = 1000;
    const VARIANCE = 10; // ±10 %
    for (let i = 0; i < 200; i++) {
      const v = calc.calculate({ mode: 'basis', base: BASE, variance: VARIANCE }, rng);
      expect(v).toBeGreaterThanOrEqual(900 - 0.01); // allow 1-cent rounding
      expect(v).toBeLessThanOrEqual(1100 + 0.01);
    }
  });

  it('returns base exactly when variance = 0', () => {
    const rng = createRng(SEED);
    expect(calc.calculate({ mode: 'basis', base: 500, variance: 0 }, rng)).toBe(500);
  });

  it('returns base*(1-v) when rng → 0', () => {
    // noise = (0*2-1) * v = -v
    const v = calc.calculate({ mode: 'basis', base: 1000, variance: 10 }, zeroRng);
    expect(v).toBe(900);
  });

  it('returns base*(1+v) when rng → 1', () => {
    // noise = ((1-ε)*2-1)*v ≈ +v
    const v = calc.calculate({ mode: 'basis', base: 1000, variance: 10 }, oneRng);
    expect(v).toBeCloseTo(1100, 1);
  });

  it('mean converges near base over many calls', () => {
    const rng = createRng(SEED);
    const BASE = 2000;
    const samples = Array.from({ length: 1000 }, () =>
      calc.calculate({ mode: 'basis', base: BASE, variance: 20 }, rng),
    );
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(1960);
    expect(mean).toBeLessThan(2040);
  });

  it('handles negative base correctly (mirrors symmetry)', () => {
    const rng = createRng(SEED);
    const BASE = -1000;
    for (let i = 0; i < 100; i++) {
      const v = calc.calculate({ mode: 'basis', base: BASE, variance: 10 }, rng);
      // For negative base, ±10% flips: lower bound is -1100, upper is -900
      expect(v).toBeGreaterThanOrEqual(-1100 - 0.01);
      expect(v).toBeLessThanOrEqual(-900 + 0.01);
    }
  });

  it('is deterministic: same seed → same sequence', () => {
    const rng1 = createRng(SEED);
    const rng2 = createRng(SEED);
    for (let i = 0; i < 20; i++) {
      const a = calc.calculate({ mode: 'basis', base: 750, variance: 15 }, rng1);
      const b = calc.calculate({ mode: 'basis', base: 750, variance: 15 }, rng2);
      expect(a).toBe(b);
    }
  });

  it('variance 100% allows output near 0 for positive base (when rng → 0)', () => {
    const v = calc.calculate({ mode: 'basis', base: 500, variance: 100 }, zeroRng);
    expect(v).toBe(0);
  });
});

// ── Trend – linear ────────────────────────────────────────────────────────────

describe('Linear trend', () => {
  it('adds rate × years to the base amount', () => {
    // Fixed base = 1000, rate = 120 EUR/year, Δ = exactly 1 year
    const result = calc.calculate({ mode: 'fix', amount: 1000 }, zeroRng, '2021-01-01', {
      type: 'linear',
      rate: 120,
      startDate: '2020-01-01',
    });
    // Δ years ≈ 1.0 (365/365.25 is very close to 1)
    expect(result).toBeCloseTo(1120, 0);
  });

  it('applies zero growth when Δ = 0 (same date)', () => {
    const result = calc.calculate({ mode: 'fix', amount: 500 }, zeroRng, '2023-06-01', {
      type: 'linear',
      rate: 600,
      startDate: '2023-06-01',
    });
    expect(result).toBe(500);
  });

  it('applies negative rate (declining trend)', () => {
    const result = calc.calculate({ mode: 'fix', amount: 1000 }, zeroRng, '2021-01-01', {
      type: 'linear',
      rate: -100,
      startDate: '2020-01-01',
    });
    expect(result).toBeCloseTo(900, 0);
  });

  it('applies trend before startDate (back-casting)', () => {
    const result = calc.calculate({ mode: 'fix', amount: 1000 }, zeroRng, '2019-01-01', {
      type: 'linear',
      rate: 100,
      startDate: '2020-01-01',
    });
    // Δ ≈ -1 year → 1000 + 100×(-1) = 900
    expect(result).toBeCloseTo(900, 0);
  });

  it('accumulates over multiple years', () => {
    const result = calc.calculate({ mode: 'fix', amount: 1000 }, zeroRng, '2025-01-01', {
      type: 'linear',
      rate: 100,
      startDate: '2020-01-01',
    });
    // Δ ≈ 5 years → 1000 + 100×5 = 1500
    expect(result).toBeCloseTo(1500, 0);
  });
});

// ── Trend – exponential ───────────────────────────────────────────────────────

describe('Exponential trend', () => {
  it('compounds at given rate per year', () => {
    // base 1000, 5% p.a., ~1 year: use non-leap span for accuracy
    const result = calc.calculate({ mode: 'fix', amount: 1000 }, zeroRng, '2022-01-01', {
      type: 'exponential',
      rate: 0.05,
      startDate: '2021-01-01',
    });
    // Δ ≈ 1 year → 1000 * 1.05 ≈ 1050
    expect(result).toBeCloseTo(1050, 0);
  });

  it('returns base unchanged when Δ = 0 (exponent = 0)', () => {
    const result = calc.calculate({ mode: 'fix', amount: 750 }, zeroRng, '2023-03-15', {
      type: 'exponential',
      rate: 0.1,
      startDate: '2023-03-15',
    });
    expect(result).toBe(750);
  });

  it('applies negative rate (exponential decay)', () => {
    const result = calc.calculate({ mode: 'fix', amount: 1000 }, zeroRng, '2022-01-01', {
      type: 'exponential',
      rate: -0.1,
      startDate: '2021-01-01',
    });
    // 1000 × 0.9^~1 ≈ 900
    expect(result).toBeCloseTo(900, 0);
  });

  it('compounds correctly over 10 years (3% p.a.)', () => {
    const result = calc.calculate({ mode: 'fix', amount: 1000 }, zeroRng, '2030-01-01', {
      type: 'exponential',
      rate: 0.03,
      startDate: '2020-01-01',
    });
    // 1000 × 1.03^10 ≈ 1343.92
    expect(result).toBeCloseTo(1343.92, 0);
  });
});

// ── Trend with random modes ───────────────────────────────────────────────────

describe('Trend combined with random modes', () => {
  it('applies linear trend on top of range result', () => {
    // midpoint rng gives (100+300)/2 = 200; + 50*~1 ≈ 250
    const result = calc.calculate({ mode: 'range', min: 100, max: 300 }, halfRng, '2022-01-01', {
      type: 'linear',
      rate: 50,
      startDate: '2021-01-01',
    });
    expect(result).toBeCloseTo(250, 0);
  });

  it('applies exponential trend on top of basis result', () => {
    // zero rng + variance=0 → base = 1000; * 1.1^~1 ≈ 1100
    const result = calc.calculate(
      { mode: 'basis', base: 1000, variance: 0 },
      zeroRng,
      '2022-01-01',
      { type: 'exponential', rate: 0.1, startDate: '2021-01-01' },
    );
    // ~1100 ± 2
    expect(result).toBeGreaterThan(1099);
    expect(result).toBeLessThan(1102);
  });
});

// ── Rounding ──────────────────────────────────────────────────────────────────

describe('Rounding', () => {
  it('result always has at most 2 decimal places', () => {
    const rng = createRng(SEED);
    for (let i = 0; i < 200; i++) {
      const v = calc.calculate({ mode: 'range', min: 0.001, max: 9999.999 }, rng);
      const rounded = Math.round(v * 100) / 100;
      expect(v).toBe(rounded);
    }
  });
});

// ── AmountCalculator.yearDelta ─────────────────────────────────────────────────

describe('AmountCalculator.yearDelta()', () => {
  it('returns 0 for identical dates', () => {
    expect(AmountCalculator.yearDelta('2023-06-01', '2023-06-01')).toBe(0);
  });

  it('returns approximately 1 for a one-year span', () => {
    const delta = AmountCalculator.yearDelta('2021-01-01', '2022-01-01');
    expect(delta).toBeCloseTo(1, 1);
  });

  it('returns approximately 5 for a five-year span', () => {
    const delta = AmountCalculator.yearDelta('2020-01-01', '2025-01-01');
    expect(delta).toBeCloseTo(5, 0);
  });

  it('returns a negative value when to < from', () => {
    const delta = AmountCalculator.yearDelta('2023-01-01', '2022-01-01');
    expect(delta).toBeCloseTo(-1, 1);
  });

  it('returns approximately 0.5 for a half-year span', () => {
    const delta = AmountCalculator.yearDelta('2023-01-01', '2023-07-02');
    expect(delta).toBeCloseTo(0.5, 1);
  });
});
