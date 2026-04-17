/**
 * src/domain/RecurringEngine.ts
 *
 * RecurringEngine – generates standing-order / direct-debit transactions
 * from a `RecurringRule` for a given `GenerationContext` (P2-03 / CLA-32).
 *
 * ### Algorithm
 * 1. Build a sequence of nominal dates by advancing through the cycle period.
 * 2. For each nominal date, resolve the actual booking date using the
 *    `bookingDayType` + `WorkingDayCalendar`.
 * 3. Skip dates outside [startDate, endDate].
 * 4. Compute the amount via `AmountCalculator` (with optional trend).
 * 5. Apply the `transactionType` sign convention.
 * 6. Emit a `Transaction` for each resolved date.
 *
 * ### Booking day types (Buchungstag-Typen)
 * - `fix`     : exact calendar date, no adjustment.
 * - `working` : advance to the next working day when the nominal date falls on
 *               a weekend or public holiday (SEPA mode only; no-op in Instant).
 * - `ultimo`  : last calendar day of the month, then working-day adjusted in
 *               SEPA mode (advance backward to avoid spilling into next month).
 * - `sepa`    : SEPA business day – identical to `working` in behaviour, but
 *               semantically reserved for SEPA-specific scheduling.
 *
 * ### Sign convention
 * - `income`   → positive (credit)
 * - `expense`  → negative (debit)
 * - `transfer` → AmountConfig sign is used as-is
 *
 * Usage:
 *   const engine = new RecurringEngine();
 *   const txns = engine.generate(rule, context);
 */

import { randomUUID } from 'node:crypto';
import { AmountCalculator } from './AmountCalculator.js';
import { workingDayCalendar, type FederalState } from './calendar/WorkingDayCalendar.js';
import { createRng } from './rng/seededRng.js';
import type { GenerationContext, RecurringRule, Transaction } from './types.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Months added per cycle period. */
const CYCLE_MONTHS: Record<RecurringRule['cycle'], number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

// ── RecurringEngine ───────────────────────────────────────────────────────────

export class RecurringEngine {
  private readonly amountCalc = new AmountCalculator();

  /**
   * Generate all recurring transactions for the given rule within the
   * date range specified in `context`.
   *
   * @param rule    - The recurring rule to evaluate.
   * @param context - Runtime parameters (date range, payment mode, state, seed).
   * @returns Array of `Transaction` objects, sorted ascending by date.
   */
  generate(rule: RecurringRule, context: GenerationContext): Transaction[] {
    if (!rule.enabled) return [];

    const seed = rule.seed ?? context.globalSeed;
    const rng = createRng(seed);

    const startMs = dateToUtcMs(context.startDate);
    const endMs = dateToUtcMs(context.endDate);

    const transactions: Transaction[] = [];
    const cycleMonths = CYCLE_MONTHS[rule.cycle];
    const state = context.federalState as FederalState;

    // Determine the first nominal date on or after context.startDate.
    // We start iteration from the month of startDate and find the first
    // nominal occurrence within or after that month.
    let { year, month } = splitYearMonth(context.startDate);

    // Iterate until the nominal date exceeds endDate.
    // We advance by `cycleMonths` each iteration.
    for (;;) {
      const nominal = nominalDate(year, month, rule.dayOfMonth, rule.bookingDayType);
      const booking = resolveBookingDate(nominal, rule.bookingDayType, context.paymentMode, state);
      const bookingMs = booking.getTime();

      if (bookingMs > endMs) break; // exhausted the range

      if (bookingMs >= startMs) {
        const dateStr = msToDateStr(bookingMs);
        const rawAmount = this.amountCalc.calculate(rule.amount, rng, dateStr, rule.trend);
        const amount = applySign(rawAmount, rule.transactionType);

        transactions.push({
          id: randomUUID(),
          date: dateStr,
          time: '00:00',
          amount,
          purpose: rule.purpose,
          counterparty: rule.counterparty,
          category: rule.category,
          source: 'recurring',
          ruleId: rule.id,
        });
      }

      // Advance to next cycle.
      const next = addMonths(year, month, cycleMonths);
      year = next.year;
      month = next.month;

      // Safety: if the new month is already way past endDate, stop.
      if (
        year * 12 + month >
        endYear(context.endDate) * 12 + endMonth(context.endDate) + cycleMonths
      ) {
        break;
      }
    }

    return transactions;
  }
}

// ── Shared singleton ──────────────────────────────────────────────────────────

/** Shared engine instance. */
export const recurringEngine = new RecurringEngine();

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Compute the nominal calendar date for a booking within the given month.
 *
 * - For `ultimo`: last day of the month.
 * - Otherwise: `dayOfMonth` clamped to the last valid day of that month.
 */
function nominalDate(
  year: number,
  month: number, // 1-based
  dayOfMonth: number,
  bookingDayType: RecurringRule['bookingDayType'],
): Date {
  if (bookingDayType === 'ultimo') {
    return utcDate(year, month, lastDayOfMonth(year, month));
  }
  const clamped = Math.min(dayOfMonth, lastDayOfMonth(year, month));
  return utcDate(year, month, clamped);
}

/**
 * Resolve the booking date from a nominal date using the booking day type.
 */
function resolveBookingDate(
  nominal: Date,
  bookingDayType: RecurringRule['bookingDayType'],
  paymentMode: GenerationContext['paymentMode'],
  state?: FederalState,
): Date {
  switch (bookingDayType) {
    case 'fix':
      return new Date(nominal.getTime());

    case 'working':
    case 'sepa':
      // Advance to next working day (no-op in instant mode).
      return workingDayCalendar.nextWorkingDay(nominal, paymentMode, state);

    case 'ultimo': {
      // For ultimo in SEPA mode we step *backward* to the previous working day
      // so we don't spill into the next month.
      if (paymentMode === 'sepa') {
        return workingDayCalendar.prevWorkingDay(nominal, paymentMode, state);
      }
      return new Date(nominal.getTime());
    }
  }
}

/** Apply the transaction type sign to the raw amount. */
function applySign(amount: number, transactionType: RecurringRule['transactionType']): number {
  switch (transactionType) {
    case 'income':
      return Math.abs(amount);
    case 'expense':
      return -Math.abs(amount);
    case 'transfer':
      return amount; // sign as-is from AmountConfig
  }
}

// ── Date utilities ────────────────────────────────────────────────────────────

/** Construct a UTC midnight Date for the given year/month(1-based)/day. */
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Parse a YYYY-MM-DD string to UTC milliseconds. */
function dateToUtcMs(dateStr: string): number {
  return Date.parse(dateStr);
}

/** Format UTC milliseconds as YYYY-MM-DD. */
function msToDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Return the number of days in a given month (1-based). */
function lastDayOfMonth(year: number, month: number): number {
  // Day 0 of month+1 = last day of month
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Extract { year, month } from a YYYY-MM-DD string. */
function splitYearMonth(dateStr: string): { year: number; month: number } {
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(5, 7), 10);
  return { year, month };
}

/** Add n months to (year, month), returning the new { year, month }. */
function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const total = month - 1 + n;
  return {
    year: year + Math.floor(total / 12),
    month: (total % 12) + 1,
  };
}

function endYear(dateStr: string): number {
  return parseInt(dateStr.slice(0, 4), 10);
}
function endMonth(dateStr: string): number {
  return parseInt(dateStr.slice(5, 7), 10);
}
