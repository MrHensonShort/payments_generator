/**
 * src/domain/calendar/WorkingDayCalendar.ts
 *
 * WorkingDayCalendar – working-day logic for SEPA and Instant payment modes
 * covering all 16 German federal states (P1-05, AT-01 to AT-07, E-02).
 *
 * SEPA mode
 *   A date is a working day when it is neither a weekend (Sat/Sun) nor a
 *   public holiday.  When a federal state is supplied, state-specific holidays
 *   are included; otherwise only nationally shared holidays apply.
 *   Date arithmetic uses UTC to avoid DST-induced off-by-one errors.
 *
 * Instant mode (SEPA Instant Credit Transfer)
 *   Settlement is available 24/7/365 – every calendar day is treated as a
 *   working day (AT-06).
 *
 * Holiday data range: 2000–2050.  Dates outside that range are handled
 * conservatively: weekends are still excluded in SEPA mode, but no holiday
 * check is performed (treats out-of-range days as non-holidays).
 */

import { isPublicHoliday, isWeekend, type FederalState } from './holidayData';

export type { FederalState } from './holidayData';
export type PaymentMode = 'sepa' | 'instant';

// ── WorkingDayCalendar ────────────────────────────────────────────────────────

export class WorkingDayCalendar {
  /**
   * Return true if `date` is a working day given the payment mode and optional
   * German federal state.
   *
   * @param date  - The date to evaluate (UTC midnight recommended).
   * @param mode  - 'sepa' applies business-day rules; 'instant' always returns true.
   * @param state - Optional federal state for state-specific holiday lookup.
   */
  isWorkingDay(date: Date, mode: PaymentMode, state?: FederalState): boolean {
    if (mode === 'instant') return true; // AT-06: Instant is 24/7/365

    // AT-02: exclude weekends
    if (isWeekend(date)) return false;

    // AT-03 / AT-04: exclude public holidays (national + state-specific)
    if (isPublicHoliday(date, state)) return false;

    return true;
  }

  /**
   * Return the next working day on or after `date`.
   * If `date` is already a working day, it is returned unchanged (new Date copy).
   *
   * Advances day by day until a working day is found.  In practice this loop
   * terminates quickly (≤ 4 iterations for any SEPA scenario) because no more
   * than 4 consecutive non-working days exist in the German calendar.
   *
   * @param date  - Start date (UTC midnight recommended).
   * @param mode  - Payment mode.
   * @param state - Optional federal state.
   */
  nextWorkingDay(date: Date, mode: PaymentMode, state?: FederalState): Date {
    let d = new Date(date.getTime());
    while (!this.isWorkingDay(d, mode, state)) {
      d = new Date(d.getTime() + 86_400_000); // +1 day in ms
    }
    return d;
  }

  /**
   * Return the previous working day on or before `date`.
   * If `date` is already a working day, it is returned unchanged (new Date copy).
   *
   * Steps backwards day by day until a working day is found.
   *
   * @param date  - Start date (UTC midnight recommended).
   * @param mode  - Payment mode.
   * @param state - Optional federal state.
   */
  prevWorkingDay(date: Date, mode: PaymentMode, state?: FederalState): Date {
    let d = new Date(date.getTime());
    while (!this.isWorkingDay(d, mode, state)) {
      d = new Date(d.getTime() - 86_400_000); // -1 day in ms
    }
    return d;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/** Shared calendar instance – import this in engines and tests. */
export const workingDayCalendar = new WorkingDayCalendar();
