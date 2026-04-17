/**
 * src/domain/AmountCalculator.ts
 *
 * Amount calculation for the Payments Generator (P2-01).
 *
 * Supports three amount modes:
 *   - fix     : constant EUR amount
 *   - range   : uniform random in [min, max]
 *   - basis   : base amount ± percentage variance (symmetric, uniform noise)
 *
 * An optional TrendConfig can be layered on top of any mode to model
 * long-term growth or decline via a linear or exponential curve.
 *
 * All randomised modes consume exactly one RngFn call per invocation,
 * making the output fully deterministic when a seeded RNG is supplied.
 *
 * Usage:
 *   const calc = new AmountCalculator();
 *   const rng  = createRng(42);
 *
 *   // Fixed EUR 1 000
 *   calc.calculate({ mode: 'fix', amount: 1000 }, rng);
 *
 *   // Random in [800, 1200]
 *   calc.calculate({ mode: 'range', min: 800, max: 1200 }, rng);
 *
 *   // Base 1000 ±10 % with 3 % p.a. linear growth starting 2020-01-01
 *   calc.calculate(
 *     { mode: 'basis', base: 1000, variance: 10 },
 *     rng,
 *     '2023-06-15',
 *     { type: 'linear', rate: 30, startDate: '2020-01-01' },
 *   );
 */

import { type RngFn, randomFloat } from './rng/seededRng.js';

// ── AmountConfig ──────────────────────────────────────────────────────────────

/** Fixed amount mode: always returns exactly `amount` EUR (before trend). */
export interface FixAmountConfig {
  mode: 'fix';
  /** Amount in EUR. May be negative (debit). */
  amount: number;
}

/**
 * Range mode: picks a uniformly distributed float in the closed interval
 * [min, max] using one RNG call.
 */
export interface RangeAmountConfig {
  mode: 'range';
  /** Lower bound in EUR (inclusive). */
  min: number;
  /** Upper bound in EUR (inclusive). Must be ≥ min. */
  max: number;
}

/**
 * Basis±% mode: applies symmetric uniform noise to a base amount.
 *
 * The RNG samples a factor in (-variance%, +variance%) so the result
 * lies in [base * (1 - v), base * (1 + v)] where v = variance / 100.
 *
 * Example: base=1000, variance=10 → result in [900, 1100].
 */
export interface BasisAmountConfig {
  mode: 'basis';
  /** Base amount in EUR. May be negative. */
  base: number;
  /**
   * Maximum percentage deviation from the base, expressed as a positive
   * number in [0, 100].  E.g. 10 means ±10 %.
   */
  variance: number;
}

/** Discriminated union of the three supported amount modes. */
export type AmountConfig = FixAmountConfig | RangeAmountConfig | BasisAmountConfig;

// ── TrendConfig ───────────────────────────────────────────────────────────────

/**
 * Optional trend layer applied on top of the base amount.
 *
 * The trend is computed from `startDate` to the `date` argument passed to
 * `calculate()`.  If `date` is before `startDate` the result can be negative
 * (for linear) or a fraction (for exponential) – which is intentional and
 * allows back-casting scenarios.
 */
export interface TrendConfig {
  /**
   * - `linear`:      adds `rate` EUR for each year elapsed since `startDate`.
   *                  Result = base + rate × Δyears
   * - `exponential`: compounds `rate` per year since `startDate`.
   *                  Result = base × (1 + rate)^Δyears
   */
  type: 'linear' | 'exponential';
  /**
   * For `linear`:      increment in EUR per year (negative = downward trend).
   * For `exponential`: annual growth rate as a decimal fraction
   *                    (e.g. 0.03 = 3 % p.a.; negative values model decline).
   */
  rate: number;
  /**
   * Reference date (YYYY-MM-DD) at which the trend starts.
   * Typically the rule's creation date or the generation period start.
   */
  startDate: string;
}

// ── AmountCalculator ──────────────────────────────────────────────────────────

/**
 * Computes EUR amounts for payment simulation.
 *
 * Instantiate once and reuse across many `calculate()` calls.
 * The calculator is stateless; all randomness comes from the caller-supplied
 * `rng` function (see `createRng` in seededRng.ts).
 */
export class AmountCalculator {
  /**
   * Compute a single payment amount.
   *
   * @param config  - Amount mode configuration (fix / range / basis).
   * @param rng     - Pseudo-random number generator function.
   * @param date    - Settlement date (YYYY-MM-DD). Required when `trend` is
   *                  provided; ignored otherwise.
   * @param trend   - Optional trend applied after the base amount is computed.
   * @returns Amount in EUR, rounded to 2 decimal places.
   */
  calculate(config: AmountConfig, rng: RngFn, date?: string, trend?: TrendConfig): number {
    let amount = this.computeBase(config, rng);

    if (trend !== undefined && date !== undefined) {
      amount = this.applyTrend(amount, trend, date);
    }

    return AmountCalculator.round2(amount);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private computeBase(config: AmountConfig, rng: RngFn): number {
    switch (config.mode) {
      case 'fix':
        return config.amount;

      case 'range':
        return randomFloat(rng, config.min, config.max);

      case 'basis': {
        // Uniform noise in (-variance%, +variance%)
        // rng() → [0,1)  →  2*rng()-1 → (-1,1)  →  * (variance/100) → (-v, v)
        const v = config.variance / 100;
        const noise = (rng() * 2 - 1) * v;
        return config.base * (1 + noise);
      }
    }
  }

  private applyTrend(amount: number, trend: TrendConfig, date: string): number {
    const deltaYears = AmountCalculator.yearDelta(trend.startDate, date);

    if (trend.type === 'linear') {
      return amount + trend.rate * deltaYears;
    }
    // exponential
    return amount * Math.pow(1 + trend.rate, deltaYears);
  }

  /**
   * Compute fractional years elapsed from `from` to `to` (YYYY-MM-DD).
   * Uses a simplified 365.25-day year for consistency across leap years.
   * Negative when `to` < `from`.
   */
  static yearDelta(from: string, to: string): number {
    const msFrom = Date.parse(from);
    const msTo = Date.parse(to);
    const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
    return (msTo - msFrom) / MS_PER_YEAR;
  }

  /** Round a number to 2 decimal places using banker-neutral arithmetic. */
  private static round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
