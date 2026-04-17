/**
 * src/domain/EpisodeEngine.ts
 *
 * EpisodeEngine – generates episodic transactions from an `EpisodeRule`
 * for a given `GenerationContext` (P3-01 / CLA-35).
 *
 * ### Algorithm
 * 1. Align iteration to the first cycle boundary at or before `startDate`.
 * 2. For each cycle period within [startDate, endDate]:
 *    a. Regular mode: always generate a transaction (EP-03).
 *    b. Irregular mode: generate with probability `frequency.probability` (EP-04).
 * 3. For each firing cycle, pick a random booking day in the effective range
 *    (intersection of cycle bounds with [startDate, endDate]).
 * 4. Resolve the actual booking date via `bookingDayType` + `WorkingDayCalendar`.
 * 5. Pick a random category and counterparty using the rule RNG.
 * 6. Compute the amount via `AmountCalculator` (with optional trend).
 * 7. Apply the `transactionType` sign convention.
 * 8. Emit a `Transaction` for each occurrence.
 *
 * ### Cycle alignment
 * Cycles are aligned to natural calendar boundaries:
 *   - monthly    → each calendar month
 *   - quarterly  → Q1 Jan–Mar, Q2 Apr–Jun, Q3 Jul–Sep, Q4 Oct–Dec
 *   - semiannual → H1 Jan–Jun, H2 Jul–Dec
 *   - annual     → each calendar year (Jan–Dec)
 *
 * ### Purpose template
 * Occurrences are counted from 1; `{n}` in `rule.purpose` is replaced with the
 * 1-indexed occurrence number.
 *
 * Usage:
 *   const engine = new EpisodeEngine();
 *   const txns = engine.generate(rule, context);
 */

import { AmountCalculator } from './AmountCalculator.js';
import { workingDayCalendar, type FederalState } from './calendar/WorkingDayCalendar.js';
import { createRng, randomInt, pick, seededUUID } from './rng/seededRng.js';
import type { EpisodeRule, GenerationContext, Transaction } from './types.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Months in each cycle period. */
const CYCLE_MONTHS: Record<EpisodeRule['cycle'], number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

// ── EpisodeEngine ─────────────────────────────────────────────────────────────

export class EpisodeEngine {
  private readonly amountCalc = new AmountCalculator();

  /**
   * Generate all episode transactions for the given rule within the date range
   * specified in `context`. Results are sorted ascending by date.
   *
   * @param rule    - The episode rule to evaluate.
   * @param context - Runtime parameters (date range, payment mode, state, seed).
   * @returns Sorted array of `Transaction` objects.
   */
  generate(rule: EpisodeRule, context: GenerationContext): Transaction[] {
    if (!rule.enabled) return [];

    const seed = rule.seed ?? context.globalSeed;
    const rng = createRng(seed);

    const startMs = Date.parse(context.startDate);
    const endMs = Date.parse(context.endDate);
    const cycleMonths = CYCLE_MONTHS[rule.cycle];
    const state = context.federalState as FederalState;

    // Align to cycle boundary at or before startDate.
    let { year, month } = splitYearMonth(context.startDate);
    month = alignToCycleBoundary(month, rule.cycle);

    const transactions: Transaction[] = [];
    let occurrenceIndex = 0;

    for (;;) {
      const cycleStartMs = Date.UTC(year, month - 1, 1);

      // Cycle ends at the last millisecond of the last day before the next cycle.
      const nextCycle = addMonths(year, month, cycleMonths);
      const cycleEndMs = Date.UTC(nextCycle.year, nextCycle.month - 1, 1) - MS_PER_DAY;

      if (cycleStartMs > endMs) break;

      // Effective window: intersection of this cycle with [startDate, endDate].
      const effectiveStartMs = Math.max(cycleStartMs, startMs);
      const effectiveEndMs = Math.min(cycleEndMs, endMs);

      if (effectiveStartMs <= effectiveEndMs) {
        // Frequency check: irregular mode consumes one RNG call.
        const fires = rule.frequency.mode === 'regular' || rng() < rule.frequency.probability;

        if (fires) {
          // Pick a random day in the effective window.
          const daySpan = Math.floor((effectiveEndMs - effectiveStartMs) / MS_PER_DAY);
          const dayOffset = randomInt(rng, 0, daySpan);
          const nominalMs = effectiveStartMs + dayOffset * MS_PER_DAY;
          const nominal = new Date(nominalMs);

          // Resolve the actual booking date.
          const booking = resolveBookingDate(
            nominal,
            rule.bookingDayType,
            context.paymentMode,
            state,
          );
          const bookingMs = booking.getTime();

          // Only include if the booking date stays inside the generation window.
          if (bookingMs >= startMs && bookingMs <= endMs) {
            const dateStr = msToDateStr(bookingMs);
            const category = pick(rng, rule.categories);
            const counterparty =
              rule.counterparties.length > 0 ? pick(rng, rule.counterparties) : '';
            const purpose = rule.purpose.replace('{n}', String(occurrenceIndex + 1));
            const rawAmount = this.amountCalc.calculate(rule.amount, rng, dateStr, rule.trend);
            const amount = applySign(rawAmount, rule.transactionType);

            transactions.push({
              id: seededUUID(rng),
              date: dateStr,
              time: randomHHMM(rng),
              amount,
              purpose,
              counterparty,
              category,
              source: 'episode',
              ruleId: rule.id,
            });

            occurrenceIndex++;
          }
        }
      }

      // Advance to the next cycle.
      const next = addMonths(year, month, cycleMonths);
      year = next.year;
      month = next.month;

      // Safety guard: stop well past endDate.
      if (Date.UTC(year, month - 1, 1) > endMs + cycleMonths * 31 * MS_PER_DAY) break;
    }

    return transactions.sort((a, b) => a.date.localeCompare(b.date));
  }
}

/** Shared engine instance. */
export const episodeEngine = new EpisodeEngine();

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Return the first month of the cycle boundary that contains `month`.
 * E.g. for quarterly: month 5 (May) → 4 (April, start of Q2).
 */
function alignToCycleBoundary(month: number, cycle: EpisodeRule['cycle']): number {
  switch (cycle) {
    case 'monthly':
      return month;
    case 'quarterly':
      return Math.floor((month - 1) / 3) * 3 + 1; // 1, 4, 7, 10
    case 'semiannual':
      return Math.floor((month - 1) / 6) * 6 + 1; // 1, 7
    case 'annual':
      return 1;
  }
}

/** Resolve a nominal date to the actual booking date using the booking day type. */
function resolveBookingDate(
  nominal: Date,
  bookingDayType: EpisodeRule['bookingDayType'],
  paymentMode: GenerationContext['paymentMode'],
  state?: FederalState,
): Date {
  switch (bookingDayType) {
    case 'fix':
      return new Date(nominal.getTime());

    case 'working':
    case 'sepa':
      return workingDayCalendar.nextWorkingDay(nominal, paymentMode, state);

    case 'ultimo':
      // Treat as "adjust backward" to avoid spilling past the cycle end.
      if (paymentMode === 'sepa') {
        return workingDayCalendar.prevWorkingDay(nominal, paymentMode, state);
      }
      return new Date(nominal.getTime());
  }
}

/** Apply transaction type sign to a raw (positive) amount. */
function applySign(amount: number, type: EpisodeRule['transactionType']): number {
  switch (type) {
    case 'income':
      return Math.abs(amount);
    case 'expense':
      return -Math.abs(amount);
    case 'transfer':
      return amount; // sign from AmountConfig
  }
}

/** Generate a random HH:MM time string using the supplied RNG. */
function randomHHMM(rng: () => number): string {
  const h = randomInt(rng, 0, 23);
  const m = randomInt(rng, 0, 59);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
