/**
 * src/domain/ScatterEngine.ts
 *
 * ScatterEngine – generates scattered random transactions from a `ScatterRule`
 * for a given `GenerationContext` (P3-02 / CLA-36).
 *
 * ### Algorithm
 * 1. Iterate over each calendar month within [startDate, endDate].
 * 2. Determine the transaction count for the month via `CountConfig`:
 *    - `fixed`: always exactly `count` transactions.
 *    - `range`: uniform random integer in [min, max] (inclusive).
 * 3. For each transaction in the month:
 *    a. Pick a random day in the effective range (intersection of month with
 *       [startDate, endDate]).
 *    b. Pick a random time (HH:MM) using the rule RNG.
 *    c. Pick a random category and counterparty.
 *    d. Compute the amount (with optional trend).
 *    e. Apply the `transactionType` sign.
 *    f. Check the budget cap (SZ-02): stop early if adding this transaction
 *       would exceed `budgetPerCycle`.  Set to `Infinity` to disable.
 * 4. Sort results ascending by date, then time.
 *
 * ### Budget compliance (SZ-02)
 * Budget is tracked as the running absolute-value sum of amounts within each
 * calendar month.  Generation stops (the month loop breaks) when the next
 * transaction would cause the total to exceed `budgetPerCycle`.
 *
 * Usage:
 *   const engine = new ScatterEngine();
 *   const txns = engine.generate(rule, context);
 */

import { AmountCalculator } from './AmountCalculator.js';
import { createRng, randomInt, pick, seededUUID } from './rng/seededRng.js';
import type { ScatterRule, GenerationContext, Transaction } from './types.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── ScatterEngine ─────────────────────────────────────────────────────────────

export class ScatterEngine {
  private readonly amountCalc = new AmountCalculator();

  /**
   * Generate all scattered transactions for the given rule within the date
   * range specified in `context`. Results are sorted by date, then time.
   *
   * @param rule    - The scatter rule to evaluate.
   * @param context - Runtime parameters (date range, payment mode, state, seed).
   * @returns Sorted array of `Transaction` objects.
   */
  generate(rule: ScatterRule, context: GenerationContext): Transaction[] {
    if (!rule.enabled) return [];

    const seed = rule.seed ?? context.globalSeed;
    const rng = createRng(seed);

    const startMs = Date.parse(context.startDate);
    const endMs = Date.parse(context.endDate);

    let { year, month } = splitYearMonth(context.startDate);
    const { year: endYear, month: endMonth } = splitYearMonth(context.endDate);

    const transactions: Transaction[] = [];
    let txIndex = 0;

    while (year < endYear || (year === endYear && month <= endMonth)) {
      const monthStartMs = Date.UTC(year, month - 1, 1);
      const monthLastDay = lastDayOfMonth(year, month);
      const monthEndMs = Date.UTC(year, month - 1, monthLastDay);

      // Effective range for this calendar month.
      const effectiveStartMs = Math.max(monthStartMs, startMs);
      const effectiveEndMs = Math.min(monthEndMs, endMs);

      if (effectiveStartMs <= effectiveEndMs) {
        // Determine how many transactions to scatter across this month.
        const count =
          rule.count.mode === 'fixed'
            ? rule.count.count
            : randomInt(rng, rule.count.min, rule.count.max);

        let budgetUsed = 0;

        for (let i = 0; i < count; i++) {
          // Pick a random day in the effective window.
          const daySpan = Math.floor((effectiveEndMs - effectiveStartMs) / MS_PER_DAY);
          const dayOffset = randomInt(rng, 0, daySpan);
          const dayMs = effectiveStartMs + dayOffset * MS_PER_DAY;
          const dateStr = msToDateStr(dayMs);

          // Random time HH:MM.
          const timeStr = randomHHMM(rng);

          // Pick category and counterparty.
          const category = pick(rng, rule.categories);
          const counterparty = rule.counterparties.length > 0 ? pick(rng, rule.counterparties) : '';
          const purpose = rule.purpose.replace('{n}', String(txIndex + 1));

          // Compute amount and apply sign.
          const rawAmount = this.amountCalc.calculate(rule.amount, rng, dateStr, rule.trend);
          const amount = applySign(rawAmount, rule.transactionType);
          const absAmount = Math.abs(amount);

          // SZ-02: budget cap check.
          if (rule.budgetPerCycle !== Infinity && budgetUsed + absAmount > rule.budgetPerCycle) {
            break; // Budget would be exceeded – stop generating for this month.
          }

          budgetUsed += absAmount;

          transactions.push({
            id: seededUUID(rng),
            date: dateStr,
            time: timeStr,
            amount,
            purpose,
            counterparty,
            category,
            source: 'scatter',
            ruleId: rule.id,
          });

          txIndex++;
        }
      }

      // Advance to next calendar month.
      const next = addMonths(year, month, 1);
      year = next.year;
      month = next.month;
    }

    return transactions.sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
    );
  }
}

/** Shared engine instance. */
export const scatterEngine = new ScatterEngine();

// ── Private helpers ───────────────────────────────────────────────────────────

/** Apply transaction type sign to a raw (positive) amount. */
function applySign(amount: number, type: ScatterRule['transactionType']): number {
  switch (type) {
    case 'income':
      return Math.abs(amount);
    case 'expense':
      return -Math.abs(amount);
    case 'transfer':
      return amount;
  }
}

/** Generate a random HH:MM time string using the supplied RNG. */
function randomHHMM(rng: () => number): string {
  const h = randomInt(rng, 0, 23);
  const m = randomInt(rng, 0, 59);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Return the number of days in a given month (1-based). */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Extract { year, month } from a YYYY-MM-DD string. */
function splitYearMonth(dateStr: string): { year: number; month: number } {
  return {
    year: parseInt(dateStr.slice(0, 4), 10),
    month: parseInt(dateStr.slice(5, 7), 10),
  };
}

/** Add `n` months to a (year, month) pair. Month is 1-based. */
function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const total = month - 1 + n;
  return {
    year: year + Math.floor(total / 12),
    month: (total % 12) + 1,
  };
}

/** Format a UTC timestamp as YYYY-MM-DD. */
function msToDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
