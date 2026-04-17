/**
 * src/domain/calendar/__tests__/WorkingDayCalendar.test.ts
 *
 * Unit tests for WorkingDayCalendar (CLA-27 / P1-06).
 *
 * Coverage areas:
 *   - isWorkingDay(): instant mode, SEPA weekends, SEPA national holidays,
 *     SEPA state-specific holidays, all 16 Bundesländer
 *   - nextWorkingDay(): forward skipping over weekends and holidays
 *   - prevWorkingDay(): backward skipping over weekends and holidays
 *   - Year boundaries: 31 Dec → 1 Jan transitions
 *   - SEPA/Instant mode contrast
 *   - State-specific holiday differences (e.g. BY Fronleichnam vs. NI)
 *   - TC-01 / TC-02 from CLA-11: deterministic date-shift assertions
 */

import { describe, expect, it } from 'vitest';
import { WorkingDayCalendar, workingDayCalendar } from '../WorkingDayCalendar';
import { FEDERAL_STATES } from '../holidayData';

// Helper: create a UTC midnight Date
function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

// Helper: format Date as YYYY-MM-DD for assertions
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const cal = workingDayCalendar;

// ── isWorkingDay() ────────────────────────────────────────────────────────────

describe('isWorkingDay()', () => {
  describe('instant mode', () => {
    it('returns true for a Saturday in instant mode', () => {
      const sat = utc(2024, 1, 6); // Saturday
      expect(cal.isWorkingDay(sat, 'instant')).toBe(true);
    });

    it('returns true for a Sunday in instant mode', () => {
      const sun = utc(2024, 1, 7); // Sunday
      expect(cal.isWorkingDay(sun, 'instant')).toBe(true);
    });

    it('returns true on Christmas Day in instant mode', () => {
      expect(cal.isWorkingDay(utc(2024, 12, 25), 'instant')).toBe(true);
    });

    it('returns true on any day in instant mode regardless of state', () => {
      // New Year's Day – always a national holiday
      const nye = utc(2024, 1, 1);
      for (const state of FEDERAL_STATES) {
        expect(cal.isWorkingDay(nye, 'instant', state)).toBe(true);
      }
    });
  });

  describe('SEPA mode – weekends', () => {
    it('returns false for a Saturday', () => {
      expect(cal.isWorkingDay(utc(2024, 3, 16), 'sepa')).toBe(false); // Sat
    });

    it('returns false for a Sunday', () => {
      expect(cal.isWorkingDay(utc(2024, 3, 17), 'sepa')).toBe(false); // Sun
    });

    it('returns true for a Monday that is not a holiday', () => {
      expect(cal.isWorkingDay(utc(2024, 3, 18), 'sepa')).toBe(true); // Mon
    });
  });

  describe('SEPA mode – national holidays (no state)', () => {
    const nationalHolidays2024 = [
      [2024, 1, 1, 'Neujahr'],
      [2024, 3, 29, 'Karfreitag'],
      [2024, 4, 1, 'Ostermontag'],
      [2024, 5, 1, 'Tag der Arbeit'],
      [2024, 5, 9, 'Christi Himmelfahrt'],
      [2024, 5, 20, 'Pfingstmontag'],
      [2024, 10, 3, 'Tag der Deutschen Einheit'],
      [2024, 12, 25, '1. Weihnachtstag'],
      [2024, 12, 26, '2. Weihnachtstag'],
    ] as const;

    for (const [y, m, d, name] of nationalHolidays2024) {
      it(`returns false on ${name} (${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')})`, () => {
        expect(cal.isWorkingDay(utc(y, m, d), 'sepa')).toBe(false);
      });
    }

    it('returns true on the day after Ostermontag (regular Tuesday)', () => {
      // 2024-04-02 is a Tuesday, not a holiday
      expect(cal.isWorkingDay(utc(2024, 4, 2), 'sepa')).toBe(true);
    });
  });

  describe('SEPA mode – state-specific holidays', () => {
    it('Heilige Drei Könige (Jan 6) is a holiday in DE-BW', () => {
      expect(cal.isWorkingDay(utc(2024, 1, 6), 'sepa', 'DE-BW')).toBe(false);
    });

    it('Heilige Drei Könige (Jan 6) is a holiday in DE-BY', () => {
      expect(cal.isWorkingDay(utc(2024, 1, 6), 'sepa', 'DE-BY')).toBe(false);
    });

    it('Heilige Drei Könige (Jan 6) is a holiday in DE-ST', () => {
      expect(cal.isWorkingDay(utc(2024, 1, 6), 'sepa', 'DE-ST')).toBe(false);
    });

    it('Heilige Drei Könige (Jan 6) is NOT a holiday in DE-NW', () => {
      // Jan 6 2026 is a Tuesday – working day in NW
      expect(cal.isWorkingDay(utc(2026, 1, 6), 'sepa', 'DE-NW')).toBe(true);
    });

    it('Fronleichnam (Easter+60) is a holiday in DE-BY', () => {
      // 2024: Easter = Mar 31, Fronleichnam = May 30
      expect(cal.isWorkingDay(utc(2024, 5, 30), 'sepa', 'DE-BY')).toBe(false);
    });

    it('Fronleichnam is a holiday in DE-NW', () => {
      expect(cal.isWorkingDay(utc(2024, 5, 30), 'sepa', 'DE-NW')).toBe(false);
    });

    it('Fronleichnam is NOT a holiday in DE-HH', () => {
      expect(cal.isWorkingDay(utc(2024, 5, 30), 'sepa', 'DE-HH')).toBe(true);
    });

    it('Fronleichnam is NOT a holiday in DE-BB', () => {
      expect(cal.isWorkingDay(utc(2024, 5, 30), 'sepa', 'DE-BB')).toBe(true);
    });

    it('Maria Himmelfahrt (Aug 15) is a holiday in DE-BY', () => {
      // Aug 15 2024 is a Thursday
      expect(cal.isWorkingDay(utc(2024, 8, 15), 'sepa', 'DE-BY')).toBe(false);
    });

    it('Maria Himmelfahrt (Aug 15) is a holiday in DE-SL', () => {
      expect(cal.isWorkingDay(utc(2024, 8, 15), 'sepa', 'DE-SL')).toBe(false);
    });

    it('Maria Himmelfahrt (Aug 15) is NOT a holiday in DE-BE', () => {
      expect(cal.isWorkingDay(utc(2024, 8, 15), 'sepa', 'DE-BE')).toBe(true);
    });

    it('Allerheiligen (Nov 1) is a holiday in DE-BW', () => {
      // Nov 1 2024 is a Friday
      expect(cal.isWorkingDay(utc(2024, 11, 1), 'sepa', 'DE-BW')).toBe(false);
    });

    it('Allerheiligen (Nov 1) is NOT a holiday in DE-HH', () => {
      expect(cal.isWorkingDay(utc(2024, 11, 1), 'sepa', 'DE-HH')).toBe(true);
    });

    it('Allerheiligen (Nov 1) is NOT a holiday in DE-BE', () => {
      expect(cal.isWorkingDay(utc(2024, 11, 1), 'sepa', 'DE-BE')).toBe(true);
    });

    it('Reformationstag (Oct 31) is a holiday in DE-TH from 2000', () => {
      expect(cal.isWorkingDay(utc(2020, 10, 31), 'sepa', 'DE-TH')).toBe(false);
    });

    it('Reformationstag (Oct 31) is a holiday in DE-HH from 2018', () => {
      expect(cal.isWorkingDay(utc(2018, 10, 31), 'sepa', 'DE-HH')).toBe(false);
    });

    it('Reformationstag (Oct 31) was NOT a holiday in DE-HH before 2018', () => {
      // 2016-10-31 is a Monday – working day in HH before 2018
      expect(cal.isWorkingDay(utc(2016, 10, 31), 'sepa', 'DE-HH')).toBe(true);
    });

    it('Reformationstag 2017 is a holiday in ALL states (500th anniversary)', () => {
      // Oct 31 2017 was a national one-off holiday in all 16 states
      for (const state of FEDERAL_STATES) {
        expect(
          cal.isWorkingDay(utc(2017, 10, 31), 'sepa', state),
          `DE-${state} should have Oct 31 2017 as holiday`,
        ).toBe(false);
      }
    });

    it('Buß- und Bettag (Wed between Nov 16-22) is a holiday only in DE-SN', () => {
      // 2024: Buß- und Bettag falls on Nov 20 (Wednesday)
      const bussBettag2024 = utc(2024, 11, 20);
      expect(cal.isWorkingDay(bussBettag2024, 'sepa', 'DE-SN')).toBe(false);
      // Not a holiday in other states
      expect(cal.isWorkingDay(bussBettag2024, 'sepa', 'DE-BY')).toBe(true);
      expect(cal.isWorkingDay(bussBettag2024, 'sepa', 'DE-NW')).toBe(true);
      expect(cal.isWorkingDay(bussBettag2024, 'sepa', 'DE-HH')).toBe(true);
    });

    it('Internationaler Frauentag (Mar 8) is a holiday in DE-BE from 2019', () => {
      // Mar 8 2024 is a Friday
      expect(cal.isWorkingDay(utc(2024, 3, 8), 'sepa', 'DE-BE')).toBe(false);
    });

    it('Internationaler Frauentag (Mar 8) was NOT a holiday in DE-BE before 2019', () => {
      // Mar 8 2018 is a Thursday – working day in BE
      expect(cal.isWorkingDay(utc(2018, 3, 8), 'sepa', 'DE-BE')).toBe(true);
    });

    it('Internationaler Frauentag (Mar 8) is NOT a holiday in DE-BY', () => {
      expect(cal.isWorkingDay(utc(2024, 3, 8), 'sepa', 'DE-BY')).toBe(true);
    });

    it('Weltkindertag (Sep 20) is a holiday in DE-TH from 2019', () => {
      // Sep 20 2024 is a Friday
      expect(cal.isWorkingDay(utc(2024, 9, 20), 'sepa', 'DE-TH')).toBe(false);
    });

    it('Weltkindertag (Sep 20) is NOT a holiday in DE-NW', () => {
      expect(cal.isWorkingDay(utc(2024, 9, 20), 'sepa', 'DE-NW')).toBe(true);
    });
  });

  describe('all 16 Bundesländer – basic smoke test', () => {
    it("each state treats New Year's Day as non-working in SEPA mode", () => {
      const neujahr = utc(2025, 1, 1);
      for (const state of FEDERAL_STATES) {
        expect(
          cal.isWorkingDay(neujahr, 'sepa', state),
          `${state}: Neujahr should be non-working`,
        ).toBe(false);
      }
    });

    it('each state treats a normal Wednesday as working in SEPA mode', () => {
      // 2025-02-05 is a Wednesday with no holidays
      const wednesday = utc(2025, 2, 5);
      for (const state of FEDERAL_STATES) {
        expect(
          cal.isWorkingDay(wednesday, 'sepa', state),
          `${state}: regular Wednesday should be working`,
        ).toBe(true);
      }
    });
  });
});

// ── nextWorkingDay() ──────────────────────────────────────────────────────────

describe('nextWorkingDay()', () => {
  it('returns the same date if it is already a working day', () => {
    const mon = utc(2024, 3, 18); // Monday, no holiday
    const result = cal.nextWorkingDay(mon, 'sepa');
    expect(fmt(result)).toBe('2024-03-18');
  });

  it('advances past a Saturday and Sunday to Monday', () => {
    const fri = utc(2024, 3, 15); // Friday
    // Next working day after Saturday (Mar 16) is Monday (Mar 18)
    expect(fmt(cal.nextWorkingDay(utc(2024, 3, 16), 'sepa'))).toBe('2024-03-18');
    expect(fmt(cal.nextWorkingDay(utc(2024, 3, 17), 'sepa'))).toBe('2024-03-18');
    // Friday itself is a working day
    expect(fmt(cal.nextWorkingDay(fri, 'sepa'))).toBe('2024-03-15');
  });

  it('advances past a national holiday', () => {
    // Ostermontag 2024 = Apr 1 (Monday); next working day = Apr 2 (Tuesday)
    expect(fmt(cal.nextWorkingDay(utc(2024, 4, 1), 'sepa'))).toBe('2024-04-02');
  });

  it('advances past Easter weekend (Good Friday + weekend + Easter Monday)', () => {
    // Karfreitag 2025 = Apr 18 (Fri); next working after Ostermontag Apr 21 = Apr 22
    expect(fmt(cal.nextWorkingDay(utc(2025, 4, 18), 'sepa'))).toBe('2025-04-22');
    expect(fmt(cal.nextWorkingDay(utc(2025, 4, 19), 'sepa'))).toBe('2025-04-22'); // Sat
    expect(fmt(cal.nextWorkingDay(utc(2025, 4, 20), 'sepa'))).toBe('2025-04-22'); // Sun
    expect(fmt(cal.nextWorkingDay(utc(2025, 4, 21), 'sepa'))).toBe('2025-04-22'); // Mon (Ostermontag)
  });

  it('respects state-specific holidays when advancing', () => {
    // Fronleichnam 2024-05-30 (Thu) in DE-BY → next working day is May 31 (Fri)
    expect(fmt(cal.nextWorkingDay(utc(2024, 5, 30), 'sepa', 'DE-BY'))).toBe('2024-05-31');
    // Same day in DE-NI (no Fronleichnam) → it's already a working day
    expect(fmt(cal.nextWorkingDay(utc(2024, 5, 30), 'sepa', 'DE-NI'))).toBe('2024-05-30');
  });

  it('handles year boundary: Dec 31 → Jan 1 (holiday) → Jan 2', () => {
    // Dec 31 2024 is a Tuesday (working day)
    expect(fmt(cal.nextWorkingDay(utc(2024, 12, 31), 'sepa'))).toBe('2024-12-31');
    // Jan 1 2025 (Neujahr) → Jan 2 (Thursday)
    expect(fmt(cal.nextWorkingDay(utc(2025, 1, 1), 'sepa'))).toBe('2025-01-02');
  });

  it('instant mode: nextWorkingDay returns the same date even on holidays', () => {
    // Christmas Day
    expect(fmt(cal.nextWorkingDay(utc(2024, 12, 25), 'instant'))).toBe('2024-12-25');
  });

  it('returns a new Date instance (no mutation)', () => {
    const original = utc(2024, 3, 16); // Saturday
    const result = cal.nextWorkingDay(original, 'sepa');
    expect(result).not.toBe(original);
    expect(original.toISOString()).toBe(utc(2024, 3, 16).toISOString());
  });
});

// ── prevWorkingDay() ──────────────────────────────────────────────────────────

describe('prevWorkingDay()', () => {
  it('returns the same date if it is already a working day', () => {
    const fri = utc(2024, 3, 15); // Friday, no holiday
    expect(fmt(cal.prevWorkingDay(fri, 'sepa'))).toBe('2024-03-15');
  });

  it('steps back past a Sunday and Saturday to Friday', () => {
    expect(fmt(cal.prevWorkingDay(utc(2024, 3, 17), 'sepa'))).toBe('2024-03-15'); // Sun → Fri
    expect(fmt(cal.prevWorkingDay(utc(2024, 3, 16), 'sepa'))).toBe('2024-03-15'); // Sat → Fri
  });

  it('steps back past a national holiday', () => {
    // Ostermontag 2024 = Apr 1; prev working day = Mar 28 (Thu, Karfreitag is Fri Mar 29)
    // Actually Karfreitag 2024 = Mar 29 (Fri) → prev from Apr 1 should go Mar 28 (Thu)
    expect(fmt(cal.prevWorkingDay(utc(2024, 4, 1), 'sepa'))).toBe('2024-03-28');
  });

  it('steps back past Easter weekend cluster', () => {
    // From Ostermontag Apr 21 2025 → prev working = Apr 17 (Thu, day before Karfreitag Apr 18)
    expect(fmt(cal.prevWorkingDay(utc(2025, 4, 21), 'sepa'))).toBe('2025-04-17');
    expect(fmt(cal.prevWorkingDay(utc(2025, 4, 19), 'sepa'))).toBe('2025-04-17'); // Sat
    expect(fmt(cal.prevWorkingDay(utc(2025, 4, 18), 'sepa'))).toBe('2025-04-17'); // Fri (Karfreitag)
  });

  it('respects state-specific holidays when stepping back', () => {
    // Allerheiligen 2024-11-01 (Fri) in DE-BY → prev working = Oct 31 (Thu)
    expect(fmt(cal.prevWorkingDay(utc(2024, 11, 1), 'sepa', 'DE-BY'))).toBe('2024-10-31');
    // Same day in DE-BE (no Allerheiligen) → it's already a working day
    expect(fmt(cal.prevWorkingDay(utc(2024, 11, 1), 'sepa', 'DE-BE'))).toBe('2024-11-01');
  });

  it('handles year boundary: Jan 1 → Dec 31 (working day)', () => {
    // Jan 1 2024 (Neujahr, Mon) → prev working = Dec 29 2023 (Fri)
    // Dec 31 2023 is a Sunday; Dec 30 is Saturday; Dec 29 is Friday
    expect(fmt(cal.prevWorkingDay(utc(2024, 1, 1), 'sepa'))).toBe('2023-12-29');
  });

  it('instant mode: prevWorkingDay returns the same date even on weekends', () => {
    expect(fmt(cal.prevWorkingDay(utc(2024, 3, 17), 'instant'))).toBe('2024-03-17');
  });

  it('returns a new Date instance (no mutation)', () => {
    const original = utc(2024, 3, 17); // Sunday
    const result = cal.prevWorkingDay(original, 'sepa');
    expect(result).not.toBe(original);
    expect(original.toISOString()).toBe(utc(2024, 3, 17).toISOString());
  });
});

// ── TC-01: SEPA/Instant mode contrast ────────────────────────────────────────

describe('TC-01: SEPA vs Instant mode contrast', () => {
  const testDates = [
    utc(2024, 3, 16), // Saturday
    utc(2024, 3, 17), // Sunday
    utc(2024, 4, 1), // Ostermontag
    utc(2024, 12, 25), // Christmas
    utc(2024, 5, 30), // Fronleichnam (in BY)
  ];

  it('every date that is non-working in SEPA is working in Instant', () => {
    for (const d of testDates) {
      const sepaWorking = cal.isWorkingDay(d, 'sepa', 'DE-BY');
      const instantWorking = cal.isWorkingDay(d, 'instant', 'DE-BY');
      if (!sepaWorking) {
        expect(instantWorking).toBe(true);
      }
    }
  });
});

// ── TC-02: Year boundary assertions ──────────────────────────────────────────

describe('TC-02: Year boundary assertions', () => {
  it('Dec 31 2024 (Tue) is a working day in SEPA mode', () => {
    expect(cal.isWorkingDay(utc(2024, 12, 31), 'sepa')).toBe(true);
  });

  it('Jan 1 2025 (Neujahr) is NOT a working day in SEPA mode', () => {
    expect(cal.isWorkingDay(utc(2025, 1, 1), 'sepa')).toBe(false);
  });

  it('Jan 2 2025 (Thu) is a working day in SEPA mode', () => {
    expect(cal.isWorkingDay(utc(2025, 1, 2), 'sepa')).toBe(true);
  });

  it('nextWorkingDay from Dec 31 2024 stays on Dec 31', () => {
    expect(fmt(cal.nextWorkingDay(utc(2024, 12, 31), 'sepa'))).toBe('2024-12-31');
  });

  it('nextWorkingDay from Jan 1 2025 advances to Jan 2', () => {
    expect(fmt(cal.nextWorkingDay(utc(2025, 1, 1), 'sepa'))).toBe('2025-01-02');
  });

  it('prevWorkingDay from Jan 1 2025 steps back to Dec 30 2024 (Mon)', () => {
    // Jan 1 2025 is Wed (Neujahr); Dec 31 2024 is Tue; Dec 30 2024 is Mon
    // Dec 31 is a Tuesday – working day. Prev should be Dec 31.
    expect(fmt(cal.prevWorkingDay(utc(2025, 1, 1), 'sepa'))).toBe('2024-12-31');
  });

  it('covers all 51 years without throwing', () => {
    const states = ['DE-BY', 'DE-SN', 'DE-NW'] as const;
    for (const state of states) {
      for (let year = 2000; year <= 2050; year++) {
        const d = utc(year, 4, 1); // Easter Monday area (changes per year)
        expect(() => cal.isWorkingDay(d, 'sepa', state)).not.toThrow();
      }
    }
  });
});

// ── WorkingDayCalendar constructor ────────────────────────────────────────────

describe('WorkingDayCalendar constructor', () => {
  it('can be instantiated independently', () => {
    const cal2 = new WorkingDayCalendar();
    expect(cal2.isWorkingDay(utc(2024, 1, 1), 'sepa')).toBe(false); // Neujahr
  });
});
